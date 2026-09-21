import type { Response } from "express";
import { getPostgresDb } from "../database/db.js";
import type { AuthenticatedRequest } from "../constants/types.js";
import { generateUniqueId, makeRedisKey } from "../utils/common.utils.js";
import { classrooms, classroomStudents, users } from "../database/schema.js";
import { and, eq, inArray, sql, desc, ilike } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { containsKey, getValue, putValue, deleteKey } from "../redis/redis.api.js";

// 1. Creating classroom (Teacher)
export const createClassroom = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { name, subject, section, room, purpose, description, themeColor } = req.body;
        let teacherId = req?.user?.id;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ message: "Classroom name is required" });
        }

        const MAX_RETRIES = 10;
        let attempts = 0;
        let createdClassroom: any;
        while (attempts < MAX_RETRIES) {
            const classRoomJoinCode = generateUniqueId(teacherId || "", name, 8);
            const existsKey = await db.select().from(classrooms).where(eq(classrooms.joinCode, classRoomJoinCode));
            if (existsKey.length === 0) {
                const inserted = await db.insert(classrooms).values({
                    teacherId: teacherId!,
                    name: name.trim(),
                    subject: subject ? subject.trim() : null,
                    section: section ? section.trim() : null,
                    room: room ? room.trim() : null,
                    purpose: purpose ? purpose.trim() : null,
                    description: description ? description.trim() : null,
                    themeColor: themeColor || "#1d4ed8",
                    joinCode: classRoomJoinCode,
                }).returning();
                createdClassroom = inserted[0];
                break;
            } else {
                teacherId += randomInt(10001, 20000).toString();
            }
            attempts++;
        }

        if (createdClassroom) {
            const redisKey = makeRedisKey("CLASSROOM", createdClassroom.id);
            await putValue(redisKey, createdClassroom, "CLASSROOM");
        } else {
            return res.json({ message: "Failed to generate unique join code. Please retry." }).status(500);
        }

        return res.status(201).json({
            message: "Classroom created successfully",
            data: createdClassroom,
        });
    } catch (error: any) {
        console.error("[createClassroom] Error:", error);
        return res.status(500).json({
            message: "Error creating classroom",
            error: error.message,
        });
    }
};

// 2. Getting all classrooms by teacher
export const getClassrooms = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;

        const data = await db
            .select({
                id: classrooms.id,
                teacherId: classrooms.teacherId,
                subjectId: classrooms.subjectId,
                name: classrooms.name,
                subject: classrooms.subject,
                section: classrooms.section,
                room: classrooms.room,
                purpose: classrooms.purpose,
                description: classrooms.description,
                themeColor: classrooms.themeColor,
                joinCode: classrooms.joinCode,
                isArchived: classrooms.isArchived,
                createdAt: classrooms.createdAt,
                updatedAt: classrooms.updatedAt,
                studentCount: sql<number>`cast(count(case when ${classroomStudents.status} = 'APPROVED' then 1 end) as int)`,
                pendingCount: sql<number>`cast(count(case when ${classroomStudents.status} = 'PENDING' then 1 end) as int)`
            })
            .from(classrooms)
            .leftJoin(classroomStudents, eq(classrooms.id, classroomStudents.classroomId))
            .where(eq(classrooms.teacherId, userId))
            .groupBy(classrooms.id)
            .orderBy(desc(classrooms.createdAt));

        Promise.all(data.map(async (classroom: any) => {
            const redisKey = makeRedisKey("CLASSROOM", classroom.id);
            await putValue(redisKey, classroom, "CLASSROOM");
        })).catch(err => console.error("Cache warming failed:", err));;

        return res.status(200).json({
            message: "Classrooms fetched successfully",
            data: data,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error getting classrooms",
            error: error.message,
        });
    }
};

// 3. Get single classroom details
export const getClassroomById = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        if (!classroomId || typeof classroomId !== "string") {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        // const redisKey = makeRedisKey("CLASSROOM", classroomId);
        // if (await containsKey(redisKey)) {
        //     const cached = await getValue(redisKey);
        //     if (cached) {
        //         return res.status(200).json({
        //             message: "Classroom fetched successfully",
        //             data: cached,
        //         });
        //     }
        // }

        const results = await db
            .select({
                id: classrooms.id,
                teacherId: classrooms.teacherId,
                teacherName: users.fullName,
                teacherEmail: users.email,
                name: classrooms.name,
                subject: classrooms.subject,
                section: classrooms.section,
                room: classrooms.room,
                purpose: classrooms.purpose,
                description: classrooms.description,
                themeColor: classrooms.themeColor,
                joinCode: classrooms.joinCode,
                isArchived: classrooms.isArchived,
                createdAt: classrooms.createdAt,
                updatedAt: classrooms.updatedAt,
            })
            .from(classrooms)
            .leftJoin(users, eq(classrooms.teacherId, users.id))
            .where(eq(classrooms.id, classroomId));

        if (!results || results.length === 0) {
            return res.status(404).json({ message: "Classroom not found" });
        }

        const classroom = results[0];

        const counts = await db
            .select({
                studentCount: sql<number>`cast(count(case when ${classroomStudents.status} = 'APPROVED' then 1 end) as int)`,
                pendingCount: sql<number>`cast(count(case when ${classroomStudents.status} = 'PENDING' then 1 end) as int)`
            })
            .from(classroomStudents)
            .where(eq(classroomStudents.classroomId, classroomId));

        const fullData = {
            ...classroom,
            studentCount: counts[0]?.studentCount || 0,
            pendingCount: counts[0]?.pendingCount || 0
        };

        // await putValue(redisKey, fullData, "CLASSROOM");

        return res.status(200).json({
            message: "Classroom fetched successfully",
            data: fullData,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching classroom",
            error: error.message,
        });
    }
};

// 4. Update classroom (Teacher)
export const updateClassroom = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        const userId = req?.user?.id;
        const { name, subject, section, room, purpose, description, themeColor } = req.body;

        if (!classroomId || typeof classroomId !== "string") {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        const existing = await db.select().from(classrooms).where(eq(classrooms.id, classroomId));
        if (!existing || existing.length === 0) {
            return res.status(404).json({ message: "Classroom not found" });
        }

        if (existing[0].teacherId !== userId) {
            return res.status(403).json({ message: "You are not authorized to edit this classroom" });
        }

        const updated = await db
            .update(classrooms)
            .set({
                name: name ? name.trim() : existing[0].name,
                subject: subject !== undefined ? (subject ? subject.trim() : null) : existing[0].subject,
                section: section !== undefined ? (section ? section.trim() : null) : existing[0].section,
                room: room !== undefined ? (room ? room.trim() : null) : existing[0].room,
                purpose: purpose !== undefined ? (purpose ? purpose.trim() : null) : existing[0].purpose,
                description: description !== undefined ? (description ? description.trim() : null) : existing[0].description,
                themeColor: themeColor || existing[0].themeColor,
                updatedAt: new Date(),
            })
            .where(eq(classrooms.id, classroomId))
            .returning();

        const redisKey = makeRedisKey("CLASSROOM", classroomId);
        await deleteKey(redisKey);

        return res.status(200).json({
            message: "Classroom updated successfully",
            data: updated[0],
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error updating classroom",
            error: error.message,
        });
    }
};

// 5. Getting all classrooms joined by student (Approved + Pending)
export const getClassRoomsByStudent = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const studentEnrollments = await db
            .select()
            .from(classroomStudents)
            .where(eq(classroomStudents.studentId, userId))
            .orderBy(desc(classroomStudents.requestedAt));

        if (!studentEnrollments || studentEnrollments.length === 0) {
            return res.status(200).json({
                message: "No classrooms found for this student.",
                data: [],
            });
        }

        const classroomMap = new Map<string, any>();
        const missingIds: string[] = [];

        for (const enrollment of studentEnrollments) {
            const redisKey = makeRedisKey("CLASSROOM", enrollment.classroomId);
            if (await containsKey(redisKey)) {
                const cached = await getValue(redisKey);
                if (cached) {
                    classroomMap.set(enrollment.classroomId, cached);
                } else {
                    missingIds.push(enrollment.classroomId);
                }
            } else {
                missingIds.push(enrollment.classroomId);
            }
        }

        if (missingIds.length > 0) {
            const fetchedClassrooms = await db
                .select({
                    id: classrooms.id,
                    teacherId: classrooms.teacherId,
                    teacherName: users.fullName,
                    teacherEmail: users.email,
                    name: classrooms.name,
                    subject: classrooms.subject,
                    section: classrooms.section,
                    room: classrooms.room,
                    purpose: classrooms.purpose,
                    description: classrooms.description,
                    themeColor: classrooms.themeColor,
                    joinCode: classrooms.joinCode,
                    isArchived: classrooms.isArchived,
                    createdAt: classrooms.createdAt,
                    updatedAt: classrooms.updatedAt,
                })
                .from(classrooms)
                .leftJoin(users, eq(classrooms.teacherId, users.id))
                .where(inArray(classrooms.id, missingIds));

            for (const item of fetchedClassrooms) {
                classroomMap.set(item.id, item);
                const redisKey = makeRedisKey("CLASSROOM", item.id);
                await putValue(redisKey, item, "CLASSROOM");
            }
        }

        const combined = studentEnrollments.map((enrollment: any) => {
            const details = classroomMap.get(enrollment.classroomId) || {};
            return {
                ...details,
                classroomId: enrollment.classroomId,
                status: enrollment.status,
                requestedAt: enrollment.requestedAt,
                resolvedAt: enrollment.resolvedAt,
            };
        });

        return res.status(200).json({
            message: "Student classrooms fetched successfully.",
            data: combined,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching student classrooms",
            error: error.message,
        });
    }
};

// 6. Joining classroom (Student)
export const joinClassroom = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;
        const { joinCode } = req.body;

        if (!joinCode || typeof joinCode !== "string") {
            return res.status(400).json({ message: "Join code is required" });
        }

        const classroom = await db
            .select()
            .from(classrooms)
            .where(ilike(classrooms.joinCode, joinCode.trim()));

        if (!classroom || classroom.length === 0) {
            return res.status(404).json({ message: "Classroom not found with this code" });
        }

        const alreadyAdded = await db
            .select()
            .from(classroomStudents)
            .where(
                and(
                    eq(classroomStudents.classroomId, classroom[0].id),
                    eq(classroomStudents.studentId, userId!)
                )
            );

        if (alreadyAdded.length > 0) {
            return res.status(400).json({
                message: `You have already requested or joined this classroom (Status: ${alreadyAdded[0].status})`,
            });
        }

        const classroomStudent = await db
            .insert(classroomStudents)
            .values({
                classroomId: classroom[0].id,
                studentId: userId!,
                status: "PENDING",
            })
            .returning();

        return res.status(200).json({
            message: "Request to join classroom sent successfully. Waiting for teacher approval.",
            data: classroomStudent[0],
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error joining classroom",
            error: error.message,
        });
    }
};

// 7. Resolving individual student request (Teacher)
export const resolveRequest = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { classRoomId, classroomId: paramClassroomId, studentId, approvalStatus } = req.body;
        const targetClassroomId = (classRoomId || paramClassroomId) as string;

        if (!targetClassroomId || !studentId) {
            return res.status(400).json({ message: "Classroom ID and Student ID are required" });
        }

        const classroom = await db.select().from(classrooms).where(eq(classrooms.id, targetClassroomId));
        if (!classroom && classroom.length === 0) {
            return res.status(404).json({ "message": "Classroom not found" });
        }

        if (classroom[0].teacherId !== req?.user?.id) {
            return res.status(403).json({ message: "You are not authorized to manage this classroom" });
        }

        const existingRequest = await db
            .select()
            .from(classroomStudents)
            .where(
                and(
                    eq(classroomStudents.classroomId, targetClassroomId),
                    eq(classroomStudents.studentId, studentId),
                    eq(classroomStudents.status, "PENDING")
                )
            );

        if (!existingRequest || existingRequest.length === 0) {
            return res.status(400).json({
                message: "No pending request found for this student.",
            });
        }

        await db
            .update(classroomStudents)
            .set({
                status: approvalStatus ? "APPROVED" : "REJECTED",
                resolvedAt: new Date(),
                isNotificationRead: false,
            })
            .where(
                and(
                    eq(classroomStudents.classroomId, targetClassroomId),
                    eq(classroomStudents.studentId, studentId)
                )
            );

        await deleteKey(makeRedisKey("CLASSROOM_STUDENTS", targetClassroomId));

        return res.status(200).json({
            message: `Request ${approvalStatus ? "approved" : "rejected"} successfully.`,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error resolving request",
            error: error.message,
        });
    }
};

// 8. Bulk approving/rejecting requests (Teacher)
export const bulkApproval = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { classRoomId, classroomId: paramClassroomId, approvalStatus } = req.body;
        const targetClassroomId = (classRoomId || paramClassroomId) as string;

        if (!targetClassroomId) {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        await db
            .update(classroomStudents)
            .set({
                status: approvalStatus ? "APPROVED" : "REJECTED",
                resolvedAt: new Date(),
                isNotificationRead: false,
            })
            .where(
                and(
                    eq(classroomStudents.classroomId, targetClassroomId),
                    eq(classroomStudents.status, "PENDING")
                )
            );

        await deleteKey(makeRedisKey("CLASSROOM_STUDENTS", targetClassroomId));

        return res.status(200).json({
            message: `All requests ${approvalStatus ? "approved" : "rejected"} successfully.`,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error bulk resolving requests",
            error: error.message,
        });
    }
};

// 9. Getting pending requests for a classroom (Teacher)
export const getPendingRequests = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;

        if (!classroomId || typeof classroomId !== "string") {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        const data = await db
            .select({
                studentId: users.id,
                fullName: users.fullName,
                userName: users.userName,
                email: users.email,
                profilePictureUrl: users.profilePictureUrl,
                status: classroomStudents.status,
                requestedAt: classroomStudents.requestedAt,
            })
            .from(classroomStudents)
            .innerJoin(users, eq(classroomStudents.studentId, users.id))
            .where(
                and(
                    eq(classroomStudents.classroomId, classroomId),
                    eq(classroomStudents.status, "PENDING")
                )
            )
            .orderBy(desc(classroomStudents.requestedAt));

        return res.status(200).json({
            message: "Pending requests fetched successfully.",
            data: data,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching pending requests",
            error: error.message,
        });
    }
};

// 10. Getting approved students in a classroom
export const getStudentsInClassroom = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        const { offset = 0, limit = 50 } = req.query;

        if (!classroomId || typeof classroomId !== "string") {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        const queryOffset = typeof offset === "string" ? parseInt(offset) : Number(offset);
        const queryLimit = typeof limit === "string" ? parseInt(limit) : Number(limit);

        const redisKey = makeRedisKey("CLASSROOM_STUDENTS", classroomId);
        if (await containsKey(redisKey)) {
            const cachedStudents = await getValue(redisKey);
            if (Array.isArray(cachedStudents)) {
                const paginated = cachedStudents.slice(queryOffset * queryLimit, (queryOffset + 1) * queryLimit);
                return res.status(200).json({
                    message: "Classroom students fetched successfully.",
                    data: paginated,
                    totalCount: cachedStudents.length,
                });
            }
        }

        const data = await db
            .select({
                studentId: users.id,
                fullName: users.fullName,
                userName: users.userName,
                email: users.email,
                profilePictureUrl: users.profilePictureUrl,
                status: classroomStudents.status,
                joinedAt: classroomStudents.resolvedAt,
                requestedAt: classroomStudents.requestedAt,
            })
            .from(classroomStudents)
            .innerJoin(users, eq(classroomStudents.studentId, users.id))
            .where(
                and(
                    eq(classroomStudents.classroomId, classroomId),
                    eq(classroomStudents.status, "APPROVED")
                )
            )
            .orderBy(classroomStudents.resolvedAt);

        await putValue(redisKey, data, "CLASSROOM_STUDENTS");
        const paginated = data.slice(queryOffset * queryLimit, (queryOffset + 1) * queryLimit);

        return res.status(200).json({
            message: "Classroom students fetched successfully.",
            data: paginated,
            totalCount: data.length,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching classroom students",
            error: error.message,
        });
    }
};

// 11. Student Notifications for classroom approvals
export const getStudentNotifications = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const data = await db
            .select({
                classroomId: classrooms.id,
                classroomName: classrooms.name,
                subject: classrooms.subject,
                themeColor: classrooms.themeColor,
                teacherName: users.fullName,
                resolvedAt: classroomStudents.resolvedAt,
                isNotificationRead: classroomStudents.isNotificationRead,
            })
            .from(classroomStudents)
            .innerJoin(classrooms, eq(classroomStudents.classroomId, classrooms.id))
            .innerJoin(users, eq(classrooms.teacherId, users.id))
            .where(
                and(
                    eq(classroomStudents.studentId, userId),
                    eq(classroomStudents.status, "APPROVED"),
                    sql`${classroomStudents.resolvedAt} IS NOT NULL`
                )
            )
            .orderBy(desc(classroomStudents.resolvedAt));

        const unreadCount = data.filter((item: any) => !item.isNotificationRead).length;

        return res.status(200).json({
            message: "Notifications fetched successfully",
            data: {
                notifications: data,
                unreadCount: unreadCount,
            },
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching notifications",
            error: error.message,
        });
    }
};

// 12. Mark specific notification as read (Student)
export const markNotificationAsRead = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;
        const classroomId = req.params.classroomId as string;

        if (!userId || !classroomId || typeof classroomId !== "string") {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        await db
            .update(classroomStudents)
            .set({ isNotificationRead: true })
            .where(
                and(
                    eq(classroomStudents.studentId, userId),
                    eq(classroomStudents.classroomId, classroomId)
                )
            );

        return res.status(200).json({ message: "Notification marked as read" });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error updating notification",
            error: error.message,
        });
    }
};

// 13. Mark all notifications as read (Student)
export const markAllNotificationsAsRead = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        await db
            .update(classroomStudents)
            .set({ isNotificationRead: true })
            .where(
                and(
                    eq(classroomStudents.studentId, userId),
                    eq(classroomStudents.status, "APPROVED")
                )
            );

        return res.status(200).json({ message: "All notifications marked as read" });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error updating notifications",
            error: error.message,
        });
    }
};
