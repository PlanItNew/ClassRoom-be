import { getRedis } from "../database/db.js";
import { redisTTLs, redisConstantKeys } from "../constants/constants.js";
import { makeRedisKey } from "../utils/common.utils.js";


export const putValue = async (key: string, value: any, ttlType: string) => {
    if (value === undefined || value === null) return false;
    const ttl = redisTTLs[ttlType] || 180;
    const val = typeof value === "object" ? JSON.stringify(value) : value;
    return await getRedis().set(key, val, "EX", ttl);
};


export const getValue = async (key: string) => {
    const value = await getRedis().get(key);
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch (error) {
        return value;
    }
}


export const putHash = async (key: string, data: any, ttlType: string) => {
    if (!data || typeof data !== "object") return false;
    const ttl = redisTTLs[ttlType] || 180;
    await getRedis().hset(key, data);
    return await getRedis().expire(key, ttl);
};


// Need to check .
export const getHash = async (key: string) => {
    const data = await getRedis().hgetall(key);
    if (!data || Object.keys(data).length === 0) return null;
    return data;
};


export const deleteKey = async (key: string, ttlType?: string) => {
    return await getRedis().del(key);
};


export const deleteKeysByPattern = async (pattern: string) => {
    try {
        const redis = getRedis();
        const keys = await redis.keys(pattern);
        if (keys && keys.length > 0) {
            return await redis.del(...keys);
        }
        return 0;
    } catch (err) {
        console.error(`Error deleting keys by pattern ${pattern}:`, err);
        return 0;
    }
};


export const containsKey = async (key: string) => {
    return await getRedis().exists(key);
}


export const bulkPutValue = async (data: any[], type: string, keyProperty: string, ttlType: string) => {
    if (!data || !Array.isArray(data)) return false;
    for (const item of data) {
        if (item && item[keyProperty]) {
            const redisKey = makeRedisKey(type, item[keyProperty]);
            await putValue(redisKey, item, ttlType);
        }
    }
    return true;
};

/**
 * Caches exam questions in Redis for ultra-fast, resilient student access.
 */
export const cacheExamQuestions = async (examId: string, questionsData: any[]) => {
    const key = `${redisConstantKeys.EXAM_QUESTIONS}${examId}`;
    const serialized = JSON.stringify(questionsData);
    return await getRedis().set(key, serialized);
};

export const getExamQuestionsFromCache = async (examId: string) => {
    const key = `${redisConstantKeys.EXAM_QUESTIONS}${examId}`;
    const val = await getRedis().get(key);
    if (!val) return null;
    try {
        return JSON.parse(val);
    } catch {
        return null;
    }
};

/**
 * Initializes Redis leaderboard structure (Sorted Set) for the exam.
 */
export const initExamLeaderboard = async (examId: string) => {
    const key = `${redisConstantKeys.EXAM_LEADERBOARD}${examId}`;
    // Seed dummy score 0 with "__init__" marker to initialize the zset
    return await getRedis().zadd(key, 0, "__init__");
};

/**
 * Sets a shadow key with TTL for lifecycle & keyspace notifications.
 * Actual exam and leaderboard keys remain unexpired until shadow key expires.
 */
export const setExamShadowKey = async (examId: string, ttlSeconds: number) => {
    const key = `${redisConstantKeys.EXAM_SHADOW}${examId}`;
    return await getRedis().set(key, "active", "EX", Math.max(60, ttlSeconds));
};
