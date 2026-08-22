import { getRedis } from "../database/db.js";
import { redisTTLs } from "../constants/constants.js";


export const putValue = async (key: string, value: any, ttlType: string) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value) || typeof value === "object") value = JSON.stringify(value);
    return await getRedis().set(key, value, "EX", redisTTLs.ttlType);
}


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
    if (!data || data === undefined || typeof data !== "object") return false;
    return await getRedis().hset(key, data, "EX", redisTTLs.ttlType);
}


// Need to check .
export const getHash = async (key: string) => {
    const value = await getRedis().hget(key);
    if (!value) return null;
    return value;
}


export const deleteKey = async (key: string, ttlType: string) => {
    return await getRedis().del(key, "EX", redisTTLs.ttlType);
}


export const containsKey = async (key: string) => {
    return await getRedis().exists(key);
}