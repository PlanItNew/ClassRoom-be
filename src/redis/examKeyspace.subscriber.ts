import { Redis } from "ioredis";
import { applicationConfig } from "../config/index.js";
import { redisConstantKeys } from "../constants/constants.js";
import { getRedis, getPostgresDb } from "../database/db.js";
import { exams, examAttempts } from "../database/schema.js";
import { eq, sql } from "drizzle-orm";

let subscriberClient: Redis | null = null;

/**
 * Flushes active exam state and leaderboard from Redis to PostgreSQL
 * when the shadow key expires (marking the end of the entire exam grace window).
 */
export const flushExamResultsToDb = async (examId: string): Promise<void> => {
    try {
        console.log(`[KeyspaceSubscriber] Shadow TTL triggered for exam: ${examId}. Flushing results to DB...`);
        const redis = getRedis();
        const db = getPostgresDb();

        const leaderboardKey = `${redisConstantKeys.EXAM_LEADERBOARD}${examId}`;
        const questionsKey = `${redisConstantKeys.EXAM_QUESTIONS}${examId}`;

        // 1. Fetch all student scores from the Redis Sorted Set (ZSET)
        // Returns [member1, score1, member2, score2, ...]
        const entries = await redis.zrevrange(leaderboardKey, 0, -1, "WITHSCORES");

        if (entries && entries.length > 0) {
            const resultsToPersist: Array<{ studentId: string; score: number }> = [];

            for (let i = 0; i < entries.length; i += 2) {
                const studentId = entries[i];
                const score = parseFloat(entries[i + 1] || "0");

                // Skip placeholder initialization markers
                if (studentId && studentId !== "__init__") {
                    resultsToPersist.push({ studentId, score });
                }
            }

            if (resultsToPersist.length > 0) {
                console.log(
                    `[KeyspaceSubscriber] Persisting ${resultsToPersist.length} student scores for exam ${examId}`
                );

                // Persist/finalize student scores in PostgreSQL
                await db.transaction(async (tx: any) => {
                    for (const { studentId, score } of resultsToPersist) {
                        await tx
                            .insert(examAttempts)
                            .values({
                                examId,
                                studentId,
                                status: "SUBMITTED",
                                completedAt: new Date(),
                                totalScore: sql`${score}::numeric(5, 2)`,
                            })
                            .onConflictDoUpdate({
                                target: [examAttempts.examId, examAttempts.studentId],
                                set: {
                                    status: "SUBMITTED",
                                    completedAt: new Date(),
                                    totalScore: sql`${score}::numeric(5, 2)`,
                                },
                            });
                    }
                });
            }
        }

        // 2. Transition exam status to COMPLETED
        await db
            .update(exams)
            .set({
                status: "COMPLETED",
                updatedAt: new Date(),
            })
            .where(eq(exams.id, examId));

        // 3. Clean up the actual unexpired Redis cache keys
        await redis.del(leaderboardKey, questionsKey);

        console.log(
            `[KeyspaceSubscriber] Successfully transitioned exam ${examId} to COMPLETED and cleaned up Redis keys.`
        );
    } catch (error: any) {
        console.error(
            `[KeyspaceSubscriber] Error flushing exam ${examId} results upon shadow TTL expiry:`,
            error.message || error
        );
    }
};

/**
 * Initializes Redis Keyspace Notifications subscriber.
 * Enables 'Ex' events on Redis and listens for expired shadow keys.
 */
export const startExamKeyspaceSubscriber = async (): Promise<void> => {
    try {
        const { host, port, password } = applicationConfig.redis;
        const mainRedis = getRedis();

        // Ensure Redis server is configured to emit expired keyevent events
        try {
            await mainRedis.config("SET", "notify-keyspace-events", "Ex");
            console.log("✅ Redis notify-keyspace-events set to 'Ex'");
        } catch (configErr: any) {
            console.warn(
                "[KeyspaceSubscriber] Warning: Could not run CONFIG SET notify-keyspace-events (may be restricted on hosted Redis):",
                configErr.message
            );
        }

        // Dedicated Redis client required for Pub/Sub subscriptions
        subscriberClient = new Redis({
            host,
            port,
            password,
        });

        const expiredChannelPattern = "__keyevent@*__:expired";
        await subscriberClient.psubscribe(expiredChannelPattern);
        console.log(`[KeyspaceSubscriber] Subscribed to pattern: ${expiredChannelPattern}`);

        subscriberClient.on("pmessage", async (_pattern, _channel, expiredKey) => {
            // Check if the expired key is an exam shadow key
            if (expiredKey && expiredKey.startsWith(redisConstantKeys.EXAM_SHADOW)) {
                const examId = expiredKey.replace(redisConstantKeys.EXAM_SHADOW, "");
                console.log(
                    `[KeyspaceSubscriber] Detected expiration event on shadow key for exam: ${examId}`
                );
                await flushExamResultsToDb(examId);
            }
        });

        subscriberClient.on("error", (err) => {
            console.error("[KeyspaceSubscriber] Redis subscriber error:", err);
        });
    } catch (err: any) {
        console.error("[KeyspaceSubscriber] Failed to initialize keyspace subscriber:", err.message || err);
    }
};

export const closeExamKeyspaceSubscriber = async (): Promise<void> => {
    if (subscriberClient) {
        await subscriberClient.quit().catch(() => {});
        subscriberClient = null;
        console.log("[KeyspaceSubscriber] Subscriber closed");
    }
};
