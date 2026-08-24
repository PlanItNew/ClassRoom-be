import { getRedis } from "../database/db.js";
import { redisTTLs } from "../constants/constants.js";


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