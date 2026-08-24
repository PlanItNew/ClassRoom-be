import * as dotenv from 'dotenv';
dotenv.config();


export const redisHostKey = process.env.REDIS_HOST || "localhost";
export const redisPortKey = Number(process.env.REDIS_PORT) || 6379;
export const redisPasswordKey = process.env.REDIS_PASSWORD || "";