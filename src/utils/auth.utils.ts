import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { db } from "../database/db.js";
import { refreshTokens } from "../database/schema.js";
import { applicationConfig } from "../config/index.js";

import type { JwtPayload } from "../../constants/types.js";

export const hashPassword = (password: string): string => {
    return crypto
        .createHmac(applicationConfig.app.hasingAlgorithm, applicationConfig.app.password_salt)
        .update(password)
        .digest("hex");
};

export const generateAccessToken = (userId: string): string => {
    return jwt.sign({ userId }, applicationConfig.app.jwt_token, {
        expiresIn: applicationConfig.app.jwt_access_expiry ?? "30m",
    } as jwt.SignOptions);
};

export const generateRefreshToken = (userId: string): string => {
    return jwt.sign({ userId }, applicationConfig.app.refresh_jwt_token, {
        expiresIn: applicationConfig.app.jwt_refresh_expiry ?? "10d",
    } as jwt.SignOptions);
};

export const verifyToken = (token: string, type: string = "access"): JwtPayload => {
    return jwt.verify(token, type === "access" ? applicationConfig.app.jwt_token : applicationConfig.app.refresh_jwt_token) as JwtPayload;
};

export const decodeToken = (token: string): JwtPayload | null => {
    return jwt.decode(token) as JwtPayload | null;
};

export const issueTokensAndSetCookie = async (userId: string, res: Response) => {
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days

    await db
        .insert(refreshTokens)
        .values({
            userId,
            token: refreshToken,
            createdAt,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: refreshTokens.userId,
            set: {
                token: refreshToken,
                createdAt,
                expiresAt,
            },
        });

    res.cookie("jwt", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 60 * 1000,
    });

    return { accessToken, refreshToken };
};
