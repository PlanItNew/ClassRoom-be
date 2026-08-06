import ms, { type StringValue } from "ms";

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
    return req.headers['user-agent'];
}