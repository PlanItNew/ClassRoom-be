import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getInMilliSec } from "./common.utils.js";
import { db } from "../database/db.js";
import { refreshTokens } from "../database/schema.js";
import { applicationConfig } from "../config/index.js";

// Types
import type { JwtPayload } from "../../constants/types.js";
import type { StringValue } from "ms";
import type { Response } from "express";



export const hashSensitiveData = async (data: string): Promise<string> => {
    const saltRounds = applicationConfig.app.salt_rounds;
    return await bcrypt.hash(data, saltRounds);
};

export const verifySensitiveData = async (plainData: string, storedHash: string): Promise<boolean> => {
    return await bcrypt.compare(plainData, storedHash);
};

export const generateToken = (userId: string, type: string) => {
    return jwt.sign({ userId },
        type === "access" ? applicationConfig.app.jwt_token : applicationConfig.app.refresh_jwt_token,
        {
            expiresIn: type === "access" ? applicationConfig.app.jwt_access_expiry ?? "30m" : applicationConfig.app.jwt_refresh_expiry ?? "10d",
        } as jwt.SignOptions)
}

export const verifyToken = (token: string, type: string = "access"): JwtPayload => {
    return jwt.verify(token, type === "access" ? applicationConfig.app.jwt_token : applicationConfig.app.refresh_jwt_token) as JwtPayload;
};

export const decodeToken = (token: string): JwtPayload | null => {
    return jwt.decode(token) as JwtPayload | null;
};

export const issueTokensAndSetCookie = async (userId: string, res: Response) => {
    const accessToken = generateToken(userId, "access");
    const refreshToken = generateToken(userId, "refresh");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + getInMilliSec(applicationConfig.app.jwt_refresh_expiry as StringValue));

    const hashedRefreshToken = await hashSensitiveData(refreshToken);

    await db
        .insert(refreshTokens)
        .values({
            userId,
            token_hash: hashedRefreshToken,
            createdAt,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: refreshTokens.userId,
            set: {
                token_hash: hashedRefreshToken,
                createdAt,
                expiresAt,
            },
        });

    const accessMaxAge = applicationConfig.app.jwt_access_expiry ?
        getInMilliSec(applicationConfig.app.jwt_access_expiry as StringValue) : 30 * 60 * 1000;
    const refreshMaxAge = applicationConfig.app.jwt_refresh_expiry ?
        getInMilliSec(applicationConfig.app.jwt_refresh_expiry as StringValue) : 10 * 24 * 60 * 60 * 1000;

    res.cookie("jwt", accessToken, {
        httpOnly: true,
        secure: applicationConfig.app.environment === "production",
        maxAge: accessMaxAge,
        sameSite: "strict"
    });

    res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: applicationConfig.app.environment === "production",
        maxAge: refreshMaxAge,
        sameSite: "strict"
    });

    return { accessToken, refreshToken };
};
