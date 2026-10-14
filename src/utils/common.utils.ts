import ms, { type StringValue } from "ms";
import crypto from "crypto";
import { redisConstantKeys } from "../constants/constants.js";

export const getInMilliSec = (timePeriod: StringValue): number => {
    if (!timePeriod) {
        return 0;
    }
    const result = ms(timePeriod as StringValue);
    return typeof result === "number" ? result : NaN;
};


export const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}


export const getIp = (req: any) => {
    return Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for'] || req.ip;
}

export const getUserAgent = (req: any) => {
    return req.headers['X-Device-Info'] || req.headers['user-agent'];
}


export const getUniqueId = (type: string, userId: string) => {
    return userId + ":" + type + ":" + Math.random().toString(36).substring(2, 15);
}


export const makeRedisKey = (type: string, id: string = "") => {
    const prefix = redisConstantKeys[type] || (type.endsWith(":") ? type : type + ":");
    return prefix + id;
}


export const generateUniqueId = (id: number | string, name: string, maxLen: number = 8) => {
    const combinedString = id.toString() + " - " + name.trim();
    const hashed = crypto
        .createHash('sha256')
        .update(combinedString, 'utf-8')
        .digest('hex');
    return hashed.substring(0, maxLen);

}

export const logger = (type: String, source: String, message: any) => {
    type = type.toLowerCase();
    if (type == "info") {
        console.log(`[${type}]:: ${source}::`, message);
    } else if (type == "error") {
        if (message instanceof Error) {
            console.error(`[${type}]:: ${source}::`, message.message, (message as any).cause || "");
        } else {
            console.error(`[${type}]:: ${source}::`, message);
        }
    } else {
        console.warn(`[${type}]:: ${source}::`, message);
    }
}