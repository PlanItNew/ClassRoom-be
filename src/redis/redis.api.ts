import { getRedis } from "../database/db.js";
import { redisTTLs } from "../constants/constants.js";
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


export const containsKey = async (key: string) => {
    return await getRedis().exists(key);
}


export const bulkPustHash = async (data: any[], keyName: string, key: string, ttlType: string) => {
    if (!data || typeof data !== "object") return false;
    data.map(async (item: any) => {
        const redisKey = makeRedisKey(keyName, item[key]);
        await putHash(redisKey, item, ttlType);
    });
    return true;
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
