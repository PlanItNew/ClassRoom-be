import { Server as SocketIOServer, Socket } from "socket.io";
import type { Server as HTTPServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { getRedis, getPostgresDb } from "../database/db.js";
import { users, exams, classroomStudents } from "../database/schema.js";
import { eq, and } from "drizzle-orm";
import { verifyToken } from "../utils/auth.utils.js";
import { socketEvents, redisConstantKeys } from "../constants/constants.js";
import { ExamAttemptService } from "../services/examAttempt.service.js";
import { ExamAttemptRedisRepository } from "../redis/examAttempt.redis.js";
import { ExamSubmissionService } from "../services/examSubmission.service.js";
import { applicationConfig } from "../config/index.js";

let io: SocketIOServer | null = null;

export const getIO = (): SocketIOServer => {
    if (!io) {
        throw new Error("Socket.IO has not been initialized!");
    }
    return io;
};

export const initExamSocketGateway = async (server: HTTPServer): Promise<SocketIOServer> => {
    io = new SocketIOServer(server, {
        path: "/socket.io",
        cors: {
            origin: applicationConfig.app.clientUrl || "http://localhost:5001",
            credentials: true,
        },
        transports: ["websocket", "polling"],
        pingInterval: 15000,
        pingTimeout: 10000,
    });

    // Configure Redis Adapter for horizontal scalability across instances
    try {
        const pubClient = getRedis().duplicate();
        const subClient = getRedis().duplicate();
        io.adapter(createAdapter(pubClient, subClient));
        console.log("✅ Socket.IO Redis adapter configured successfully");
    } catch (adapterErr: any) {
        console.warn("⚠️ Could not initialize Redis adapter for Socket.IO:", adapterErr.message);
    }

    // Authentication Middleware
    io.use(async (socket: Socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.replace("Bearer ", "") ||
                (socket.handshake.query?.token as string);

            if (!token) {
                return next(new Error("AUTHENTICATION_REQUIRED"));
            }

            const payload = verifyToken(token, "access");
            if (!payload || !payload.userId) {
                return next(new Error("INVALID_AUTH_TOKEN"));
            }

            const db = getPostgresDb();
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, payload.userId))
                .limit(1);

            if (!user) {
                return next(new Error("USER_NOT_FOUND"));
            }

            socket.data.user = {
                id: user.id,
                role: user.role,
                email: user.email,
                fullName: user.fullName,
            };

            const examId =
                (socket.handshake.query?.examId as string) ||
                (socket.handshake.auth?.examId as string);

            if (!examId) {
                return next(new Error("EXAM_ID_REQUIRED"));
            }

            socket.data.examId = examId;
            next();
        } catch (err: any) {
            return next(new Error(err.message || "AUTHENTICATION_FAILED"));
        }
    });

    // Connection Handler
    io.on("connection", async (socket: Socket) => {
        const user = socket.data.user;
        const examId = socket.data.examId;
        const userId = user.id;

        console.log(`[Socket.IO] User ${userId} connected to exam ${examId} (Socket: ${socket.id})`);

        let localTimer: NodeJS.Timeout | null = null;
        let attemptExpiresAtMs = 0;

        try {
            const db = getPostgresDb();

            // Verify exam & classroom access
            const [exam] = await db
                .select()
                .from(exams)
                .where(eq(exams.id, examId))
                .limit(1);

            if (!exam) {
                socket.emit(socketEvents.ATTEMPT_ERROR, { message: "Exam not found" });
                socket.disconnect();
                return;
            }

            if (user.role === "STUDENT") {
                const [membership] = await db
                    .select()
                    .from(classroomStudents)
                    .where(
                        and(
                            eq(classroomStudents.classroomId, exam.classroomId),
                            eq(classroomStudents.studentId, userId),
                            eq(classroomStudents.status, "APPROVED")
                        )
                    )
                    .limit(1);

                if (!membership) {
                    socket.emit(socketEvents.ATTEMPT_ERROR, {
                        message: "Unauthorized: not enrolled in classroom",
                    });
                    socket.disconnect();
                    return;
                }
            }

            const userRoom = `exam:${examId}:user:${userId}`;
            const examRoom = `exam:${examId}`;

            // Single active socket session policy: disconnect older sockets for this user in userRoom
            socket.to(userRoom).emit(socketEvents.ATTEMPT_ERROR, {
                message: "Another active exam session was opened in a different tab.",
            });
            socket.to(userRoom).disconnectSockets(true);

            await socket.join(examRoom);
            await socket.join(userRoom);

            // Fetch attempt snapshot
            const snapshot = await ExamAttemptService.getAttemptSnapshot(examId, userId);

            if (!snapshot) {
                socket.emit(socketEvents.ATTEMPT_ERROR, {
                    message: "No attempt exists for this user. Please start the attempt first.",
                });
                socket.disconnect();
                return;
            }

            if (snapshot.status === "SUBMITTED") {
                socket.emit(socketEvents.ATTEMPT_SUBMITTED, snapshot);
                socket.disconnect();
                return;
            }

            attemptExpiresAtMs = new Date(snapshot.expiresAt!).getTime();

            // Emit initial full snapshot
            socket.emit(socketEvents.ATTEMPT_SNAPSHOT, snapshot);

            // Setup Socket-local timer (Section 16.B)
            const timeoutMs = attemptExpiresAtMs - Date.now();
            if (timeoutMs > 0) {
                localTimer = setTimeout(async () => {
                    console.log(`[Socket.IO] Local timer expired for user ${userId} on exam ${examId}`);
                    try {
                        await ExamSubmissionService.finalizeAttempt({
                            examId,
                            userId,
                            reason: "AUTO_TIMEOUT",
                        });

                        io?.to(userRoom).emit(socketEvents.ATTEMPT_EXPIRED, {
                            message: "Exam duration has ended. Attempt automatically submitted.",
                        });

                        // Disconnect all sockets in user room
                        io?.in(userRoom).disconnectSockets(true);
                    } catch (err: any) {
                        console.error("[Socket.IO] Error handling local timer expiration:", err.message);
                    }
                }, timeoutMs);
            } else {
                // Already expired -> finalize immediately
                await ExamSubmissionService.finalizeAttempt({
                    examId,
                    userId,
                    reason: "AUTO_TIMEOUT",
                });
                socket.emit(socketEvents.ATTEMPT_EXPIRED, {
                    message: "Exam deadline passed. Attempt submitted.",
                });
                socket.disconnect();
                return;
            }

            // Central Mutation Guard (Section 8)
            const guardMutation = async (): Promise<boolean> => {
                if (Date.now() >= attemptExpiresAtMs) {
                    await ExamSubmissionService.finalizeAttempt({
                        examId,
                        userId,
                        reason: "AUTO_TIMEOUT",
                    });
                    socket.emit(socketEvents.ATTEMPT_EXPIRED, {
                        message: "Exam duration expired. Changes not accepted.",
                    });
                    io?.in(userRoom).disconnectSockets(true);
                    return false;
                }
                return true;
            };

            // 1. Answer Save
            socket.on(
                socketEvents.ATTEMPT_ANSWER_SAVE,
                async (payload: { questionId: string; option: string; clientMutationId?: string }, ack) => {
                    try {
                        if (!(await guardMutation())) return;

                        const { questionId, option, clientMutationId } = payload;
                        if (!questionId || !option || typeof option !== "string") {
                            if (ack) ack({ success: false, error: "Invalid question or option" });
                            return;
                        }

                        const newRev = await ExamAttemptRedisRepository.saveAnswer(
                            examId,
                            userId,
                            questionId,
                            option.trim().toUpperCase()
                        );

                        const responseData = {
                            questionId,
                            option: option.trim().toUpperCase(),
                            clientMutationId,
                            revision: newRev,
                        };

                        if (ack) ack({ success: true, ...responseData });
                        io?.to(userRoom).emit(socketEvents.ATTEMPT_ANSWER_SAVED, responseData);
                    } catch (err: any) {
                        if (ack) ack({ success: false, error: err.message });
                    }
                }
            );

            // 2. Answer Clear
            socket.on(
                socketEvents.ATTEMPT_ANSWER_CLEAR,
                async (payload: { questionId: string; clientMutationId?: string }, ack) => {
                    try {
                        if (!(await guardMutation())) return;

                        const { questionId, clientMutationId } = payload;
                        if (!questionId) {
                            if (ack) ack({ success: false, error: "Invalid question ID" });
                            return;
                        }

                        const newRev = await ExamAttemptRedisRepository.clearAnswer(
                            examId,
                            userId,
                            questionId
                        );

                        const responseData = {
                            questionId,
                            clientMutationId,
                            revision: newRev,
                        };

                        if (ack) ack({ success: true, ...responseData });
                        io?.to(userRoom).emit(socketEvents.ATTEMPT_ANSWER_CLEARED, responseData);
                    } catch (err: any) {
                        if (ack) ack({ success: false, error: err.message });
                    }
                }
            );

            // 3. Review Mark
            socket.on(
                socketEvents.ATTEMPT_REVIEW_MARK,
                async (payload: { questionId: string; clientMutationId?: string }, ack) => {
                    try {
                        if (!(await guardMutation())) return;

                        const { questionId, clientMutationId } = payload;
                        await ExamAttemptRedisRepository.setReview(examId, userId, questionId, true);

                        const responseData = {
                            questionId,
                            markedForReview: true,
                            clientMutationId,
                        };

                        if (ack) ack({ success: true, ...responseData });
                        io?.to(userRoom).emit(socketEvents.ATTEMPT_REVIEW_UPDATED, responseData);
                    } catch (err: any) {
                        if (ack) ack({ success: false, error: err.message });
                    }
                }
            );

            // 4. Review Unmark
            socket.on(
                socketEvents.ATTEMPT_REVIEW_UNMARK,
                async (payload: { questionId: string; clientMutationId?: string }, ack) => {
                    try {
                        if (!(await guardMutation())) return;

                        const { questionId, clientMutationId } = payload;
                        await ExamAttemptRedisRepository.setReview(examId, userId, questionId, false);

                        const responseData = {
                            questionId,
                            markedForReview: false,
                            clientMutationId,
                        };

                        if (ack) ack({ success: true, ...responseData });
                        io?.to(userRoom).emit(socketEvents.ATTEMPT_REVIEW_UPDATED, responseData);
                    } catch (err: any) {
                        if (ack) ack({ success: false, error: err.message });
                    }
                }
            );

            // 5. Submit Attempt (Manual)
            socket.on(
                socketEvents.ATTEMPT_SUBMIT,
                async (payload: { clientMutationId?: string } = {}, ack) => {
                    try {
                        const finalResult = await ExamSubmissionService.finalizeAttempt({
                            examId,
                            userId,
                            reason: "MANUAL",
                        });

                        const responseData = {
                            attemptId: finalResult?.attempt.id,
                            totalScore: finalResult?.score,
                            status: "SUBMITTED",
                            submittedAt: new Date().toISOString(),
                            resultsReleased: finalResult?.resultsReleased,
                            clientMutationId: payload.clientMutationId,
                        };

                        if (ack) ack({ success: true, ...responseData });
                        io?.to(userRoom).emit(socketEvents.ATTEMPT_SUBMITTED, responseData);

                        // Disconnect all sockets in user room
                        setTimeout(() => {
                            io?.in(userRoom).disconnectSockets(true);
                        }, 500);
                    } catch (err: any) {
                        if (ack) ack({ success: false, error: err.message });
                    }
                }
            );

            // 6. Heartbeat / Clock Sync
            socket.on(socketEvents.ATTEMPT_HEARTBEAT, () => {
                const now = Date.now();
                socket.emit(socketEvents.ATTEMPT_TIMER_SYNC, {
                    serverTime: new Date(now).toISOString(),
                    expiresAt: new Date(attemptExpiresAtMs).toISOString(),
                    remainingSeconds: Math.max(0, Math.floor((attemptExpiresAtMs - now) / 1000)),
                });
            });

            // Clean up on disconnect
            socket.on("disconnect", (reason) => {
                console.log(
                    `[Socket.IO] User ${userId} disconnected from exam ${examId} (Reason: ${reason})`
                );
                if (localTimer) {
                    clearTimeout(localTimer);
                    localTimer = null;
                }
            });
        } catch (connErr: any) {
            console.error("[Socket.IO] Connection error:", connErr.message);
            socket.emit(socketEvents.ATTEMPT_ERROR, { message: connErr.message });
            socket.disconnect();
        }
    });

    return io;
};
