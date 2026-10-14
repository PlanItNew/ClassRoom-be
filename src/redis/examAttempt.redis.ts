import { getRedis } from "../database/db.js";
import { redisConstantKeys, redisTTLs } from "../constants/constants.js";
import type { PublicQuestionItem, AnswerKeyItem } from "../constants/types.js";

export interface ParsedAttemptState {
    examId: string;
    classroomId: string;
    userId: string;
    attemptId: string;
    startedAt: string;
    expiresAt: string;
    status: string;
    revision: number;
    questionOrder: string[];
    answers: Record<string, string>;
    reviews: Record<string, boolean>;
}

export class ExamAttemptRedisRepository {
    /**
     * Initializes Redis working state hash for an active exam attempt.
     */
    static async initAttemptState(
        examId: string,
        userId: string,
        data: {
            attemptId: string;
            classroomId: string;
            startedAt: string;
            expiresAt: string;
            questionOrder: string[];
        },
        ttlSeconds: number
    ): Promise<void> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_ATTEMPT(examId, userId);

        const hashPayload: Record<string, string> = {
            examId,
            classroomId: data.classroomId,
            userId,
            attemptId: data.attemptId,
            startedAt: data.startedAt,
            expiresAt: data.expiresAt,
            status: "IN_PROGRESS",
            revision: "1",
            questionOrder: JSON.stringify(data.questionOrder),
        };

        await redis.hset(key, hashPayload);
        await redis.expire(key, Math.max(300, ttlSeconds));

        // Add to active attempts set
        await this.addActiveAttempt(examId, userId);
    }

    /**
     * Reads and parses active attempt state from Redis hash.
     */
    static async getAttemptState(
        examId: string,
        userId: string
    ): Promise<ParsedAttemptState | null> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_ATTEMPT(examId, userId);
        const data = await redis.hgetall(key);

        if (!data || Object.keys(data).length === 0) {
            return null;
        }

        const answers: Record<string, string> = {};
        const reviews: Record<string, boolean> = {};

        for (const [k, v] of Object.entries(data)) {
            if (k.startsWith("q:") && k.endsWith(":option")) {
                const questionId = k.slice(2, -7);
                answers[questionId] = v;
            } else if (k.startsWith("q:") && k.endsWith(":review")) {
                const questionId = k.slice(2, -7);
                reviews[questionId] = v === "1";
            }
        }

        let questionOrder: string[] = [];
        try {
            questionOrder = JSON.parse(data.questionOrder || "[]");
        } catch {
            questionOrder = [];
        }

        return {
            examId: data.examId || examId,
            classroomId: data.classroomId || "",
            userId: data.userId || userId,
            attemptId: data.attemptId || "",
            startedAt: data.startedAt || "",
            expiresAt: data.expiresAt || "",
            status: data.status || "IN_PROGRESS",
            revision: parseInt(data.revision || "1", 10),
            questionOrder,
            answers,
            reviews,
        };
    }

    /**
     * Saves selected option for question in Redis attempt hash.
     */
    static async saveAnswer(
        examId: string,
        userId: string,
        questionId: string,
        option: string
    ): Promise<number> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_ATTEMPT(examId, userId);

        const newRevision = await redis.hincrby(key, "revision", 1);
        await redis.hset(key, `q:${questionId}:option`, option);
        return newRevision;
    }

    /**
     * Clears selected option for question in Redis attempt hash.
     */
    static async clearAnswer(
        examId: string,
        userId: string,
        questionId: string
    ): Promise<number> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_ATTEMPT(examId, userId);

        const newRevision = await redis.hincrby(key, "revision", 1);
        await redis.hdel(key, `q:${questionId}:option`);
        return newRevision;
    }

    /**
     * Updates review status (1 or 0) for question in Redis attempt hash.
     */
    static async setReview(
        examId: string,
        userId: string,
        questionId: string,
        isMarked: boolean
    ): Promise<void> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_ATTEMPT(examId, userId);
        await redis.hset(key, `q:${questionId}:review`, isMarked ? "1" : "0");
    }

    /**
     * Adds student to exam's active-attempt set.
     */
    static async addActiveAttempt(examId: string, userId: string): Promise<void> {
        const redis = getRedis();
        await redis.sadd(redisConstantKeys.EXAM_ACTIVE_ATTEMPTS(examId), userId);
    }

    /**
     * Removes student from exam's active-attempt set.
     */
    static async removeActiveAttempt(examId: string, userId: string): Promise<void> {
        const redis = getRedis();
        await redis.srem(redisConstantKeys.EXAM_ACTIVE_ATTEMPTS(examId), userId);
    }

    /**
     * Returns all user IDs currently in active attempts for an exam.
     */
    static async getActiveAttempts(examId: string): Promise<string[]> {
        const redis = getRedis();
        return await redis.smembers(redisConstantKeys.EXAM_ACTIVE_ATTEMPTS(examId));
    }

    /**
     * Deletes the active working state key in Redis (invoked only after DB persistence).
     */
    static async deleteAttemptState(examId: string, userId: string): Promise<void> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_ATTEMPT(examId, userId);
        await redis.del(key);
    }

    /**
     * Separates and caches public questions and private server-side answer key in Redis.
     * Students never receive the answer key!
     */
    static async cachePublicQuestionsAndAnswerKey(
        examId: string,
        questionRows: any[]
    ): Promise<void> {
        const redis = getRedis();

        // 1. Public questions: only student-facing fields
        const publicQuestions: PublicQuestionItem[] = questionRows.map((q) => ({
            id: q.id,
            question: q.question,
            options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
            difficulty: q.difficulty,
            orderSequence: q.orderSequence,
        }));

        // 2. Private answer key: correct answers and reasons
        const answerKey: AnswerKeyItem[] = questionRows.map((q) => ({
            questionId: q.id,
            correctOption: q.correctOption,
            reason: q.reason || null,
        }));

        await redis.set(
            redisConstantKeys.EXAM_QUESTIONS_PUBLIC(examId),
            JSON.stringify(publicQuestions)
        );

        await redis.set(
            redisConstantKeys.EXAM_ANSWER_KEY(examId),
            JSON.stringify(answerKey)
        );
    }

    static async getPublicQuestions(examId: string): Promise<PublicQuestionItem[] | null> {
        const redis = getRedis();
        const data = await redis.get(redisConstantKeys.EXAM_QUESTIONS_PUBLIC(examId));
        if (!data) return null;
        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    static async getAnswerKey(examId: string): Promise<AnswerKeyItem[] | null> {
        const redis = getRedis();
        const data = await redis.get(redisConstantKeys.EXAM_ANSWER_KEY(examId));
        if (!data) return null;
        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    /**
     * Updates Redis Sorted Set leaderboard for real-time ranking.
     */
    static async updateLeaderboard(
        examId: string,
        userId: string,
        score: number
    ): Promise<void> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_LEADERBOARD_KEY(examId);
        await redis.zadd(key, score, userId);
    }

    static async getLeaderboard(
        examId: string,
        limit = 50
    ): Promise<Array<{ userId: string; score: number }>> {
        const redis = getRedis();
        const key = redisConstantKeys.EXAM_LEADERBOARD_KEY(examId);
        const entries = await redis.zrevrange(key, 0, limit - 1, "WITHSCORES");

        const result: Array<{ userId: string; score: number }> = [];
        for (let i = 0; i < entries.length; i += 2) {
            const member = entries[i];
            const score = parseFloat(entries[i + 1] || "0");
            if (member && member !== "__init__") {
                result.push({ userId: member, score });
            }
        }
        return result;
    }
}
