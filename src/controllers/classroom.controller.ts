import type { Request, Response } from "express";
import { getPostgresDb } from "../database/db.js";
import type { AuthenticatedRequest } from "../constants/types.js";
import { generateUniqueId, makeRedisKey } from "../utils/common.utils.js";
import { classrooms, classroomStudents } from "../database/schema.js";
import { and, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { bulkPustHash, containsKey, getValue, putHash, putValue } from "../redis/redis.api.js";


// Creating classroom
export const createClassroom = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();

        const { name, purpose } = req.body;
        let teacherId = req?.user?.id;
        let foundUniqueCode = false;
        let data;
        while (!foundUniqueCode) {
            const classRoomJoinCode = generateUniqueId(teacherId || "", name, 8);
            const existsKey = await db.select().from(classrooms).where(eq(classrooms.joinCode, classRoomJoinCode));
            if (existsKey.length === 0) {
                data = await db.insert(classrooms).values({
                    teacherId,
                    name,
                    purpose,
                    joinCode: classRoomJoinCode
                });
                foundUniqueCode = true;
            }
            teacherId += randomInt(10001, 20000).toString();
        }
        res.status(200).json({
            message: "Classroom created successfully",
            data: data,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error creating classroom",
            error: error.message,
        });

    }
};


// Getting all classroom by teacher
export const getClassrooms = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;
        const data = await db.select().from(classrooms).where(eq(classrooms.teacherId, userId!));
        await bulkPustHash(data, "classroom", "id", "CLASSROOM");
        res.status(200).json({
            message: "Classrooms fetched successfully",
            data: data,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error getting classrooms",
            error: error.message,
        });
    }
};

// Adding student to classroom on the basis of join code
export const joinClassroom = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;
        const { joinCode } = req.body;

        const classroom = await db.select().from(classrooms).where(eq(classrooms.joinCode, joinCode));

        if (!classroom || classroom.length === 0) {
            return res.status(400).json({
                message: "Classroom not found",
            });

        }

        const alreadyAdded = await db.select().from(classroomStudents).where(eq(classroomStudents.classroomId, classroom[0].id)).where(eq(classroomStudents.studentId, userId!));

        if (alreadyAdded.length > 0) {
            return res.status(400).json({
                message: "You are already a member of this classroom",
            });
        }

        if (classroom[0].joinCode !== joinCode) {
            return res.status(400).json({
                message: "Invalid join code",
            });
        }

        const classroomStudent = await db.insert(classroomStudents).values({
            classroomId: classroom[0].id,
            studentId: userId,
            status: "PENDING",
        });

        res.status(200).json({
            message: "Classroom joined successfully",
            data: classroomStudent,
        });


    } catch (error: any) {
        res.send(500).json({
            message: "Error in joining classroom.",
            error: error.message
        })
    }
};

// Resolving request
export const resolveRequest = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { classRoomId, studentId, approvalStatus } = req.body;

        const existingRequest = await db.select().from(classroomStudents).where(eq(classroomStudents.classroomId, classRoomId)).where(eq(classroomStudents.studentId, studentId)).where(eq(classroomStudents.status, "PENDING"));

        if (!existingRequest || existingRequest.length === 0) {
            return res.status(400).json({
                message: "No pending request found for this student.",
            });
        }

        if (existingRequest[0].status === "APPROVED" || existingRequest[0].status === "REJECTED") {
            return res.status(400).json({
                message: "This request has already been processed.",
            });
        }
        await db.update(classroomStudents).set({
            status: approvalStatus ? "APPROVED" : "REJECTED",
            resolvedAt: new Date(),
        }).where(eq(classroomStudents.classroomId, classRoomId)).where(eq(classroomStudents.studentId, studentId))

        return res.status(200).json({
            message: `Request ${approvalStatus ? "approved" : "rejected"} successfully.`,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error resolving request",
            error: error.message,
        });
    }
}


// Approving all requests at once
export const bulkApproval = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { classRoomId, approvalStatus } = req.body;
        await db.update(classroomStudents).set({
            status: approvalStatus ? "APPROVED" : "REJECTED",
            resolvedAt: new Date(),
        }).where(eq(classroomStudents.classroomId, classRoomId)).where(eq(classroomStudents.status, "PENDING"));

        return res.status(200).json({
            message: `All requests ${approvalStatus ? "approved" : "rejected"} successfully.`,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error approving all requests",
            error: error.message,
        });
    }
}


// Getting pending requests
export const getPendingRequests = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { classroomId } = req.params;
        if (!classroomId || typeof classroomId !== "string") {
            return res.status(400).json({
                message: "Classroom not found",
            });
        }
        const data = await db.select().from(classroomStudents).where(and(eq(classroomStudents.classroomId, classroomId), eq(classroomStudents.status, "PENDING")));
        return res.status(200).json({
            message: "Classroom students fetched successfully.",
            data: data,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error fetching classroom students",
            error: error.message,
        });
    }
}

// Getting Approval status by student
export const getApprovalStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { classroomId } = req.params;
        const userId = req?.user?.id;
        if (!classroomId || typeof classroomId !== "string") {
            return res.status(400).json({
                message: "Classroom not found",
            });
        }
        if (!userId) {
            throw new Error("Something went wrong.")
        }
        const data = await db.select().from(classroomStudents).where(and(eq(classroomStudents.classroomId, classroomId), eq(classroomStudents.studentId, userId))).limit(1);
        return res.status(200).json({
            message: "Approval status fetched successfully.",
            data: data,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error fetching request.",
            error: error.message,
        });
    }
}

export const getStudentsInClassroom = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const { classroomId } = req.params;
        const { offset = 0, limit = 30 } = req.query;
        if (!classroomId || typeof classroomId !== "string") {
            return res.status(400).json({
                message: "Classroom not found",
            });
        }

        const queryOffset = typeof offset === "string" ? parseInt(offset) : Number(offset);
        const queryLimit = typeof limit === "string" ? parseInt(limit) : Number(limit);

        if (Number.isNaN(queryOffset) || Number.isNaN(queryLimit) || queryOffset < 0 || queryLimit <= 0 || queryLimit > 100) {
            throw new Error("Invalid offset or limit");
        }

        const redisKey = makeRedisKey("classroom:students", classroomId);
        if (await containsKey(redisKey)) {
            const cachedStudents = await getValue(redisKey);
            const filteredStudents = cachedStudents?.slice(queryOffset * queryLimit, (queryOffset + 1) * queryLimit);
            return res.status(200).json({
                message: "Classroom students fetched successfully.",
                data: filteredStudents,
            });
        }
        const data = await db.select().from(classroomStudents).where(and(eq(classroomStudents.classroomId, classroomId), eq(classroomStudents.status, "APPROVED")));
        const Students = data.slice(queryOffset * queryLimit, (queryOffset + 1) * queryLimit);
        if (data.length > 0) {
            await putHash(redisKey, data, "CLASSROOM_STUDENTS");
        }
        return res.status(200).json({
            message: "Classroom students fetched successfully.",
            data: Students,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error fetching classroom students",
            error: error.message,
        });
    }
}

export const getClassRoomsByStudent = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const userId = req?.user?.id;
        const data = await db.select().from(classroomStudents).where(eq!(classroomStudents.studentId, userId!));

        if (!data || data.length === 0) {
            return res.status(404).json({
                message: "No classroom found for this student.",
            });
        }

        const classRoomRedisKey = makeRedisKey("classroom", data[0].classroomId);

        // caching 
        if (await containsKey(classRoomRedisKey)) {
            const classroomData = await getValue(classRoomRedisKey);
            return res.status(200).json({
                message: "Classroom students fetched successfully.",
                data: classroomData,
            });
        }

        const classroomData = await db.select().from(classrooms).where(eq!(classrooms.id, data[0].classroomId!));
        await putHash(classRoomRedisKey, classroomData, "CLASSROOM");
        return res.status(200).json({
            message: "Classroom students fetched successfully.",
            data: data,
        });
    } catch (error: any) {
        res.status(500).json({
            message: "Error fetching classroom students",
            error: error.message,
        });
    }
}
