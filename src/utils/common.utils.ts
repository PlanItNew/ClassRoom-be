import ms, { type StringValue } from "ms";
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


export const makeRedisKey = (type: string, userId: string = "") => {
    return redisConstantKeys[type] + userId;
}