import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { getInMilliSec } from "./common.utils.js";
import { getPostgresDb } from "../database/db.js";
import { users, refreshTokens } from "../database/schema.js";
import { applicationConfig } from "../config/index.js";

// Types
import type { JwtPayload } from "../constants/types.js";
import type { StringValue } from "ms";
import type { Response } from "express";

export class AuthError extends Error {
    constructor(message: string, public statusCode: number = 401) {
        super(message);
        this.name = "AuthError";
    }
}

export interface RefreshSessionResult {
    user: {
        id: string;
        userName: string;
        email: string;
        fullName: string;
        role: "TEACHER" | "STUDENT";
    };
    accessToken: string;
}

export const hashPassword = async (password: string): Promise<string> => {
    if (Buffer.byteLength(password, "utf8") > 72) {
        throw new Error("Password exceeds maximum length of 72 bytes");
    }
    const saltRounds = applicationConfig.app.salt_rounds;
    return await bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (plainPassword: string, storedHash: string): Promise<boolean> => {
    if (!storedHash || Buffer.byteLength(plainPassword, "utf8") > 72) {
        return false;
    }
    return await bcrypt.compare(plainPassword, storedHash);
};

// SHA-256 Token Hashing (no 72-byte limit)
export const hashToken = (token: string): string => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

export const verifyHashedToken = (token: string, storedHash: string): boolean => {
    if (!token || !storedHash) return false;
    const computedHash = hashToken(token);
    const bufA = Buffer.from(computedHash);
    const bufB = Buffer.from(storedHash);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
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
    const db = getPostgresDb();
    const accessToken = generateToken(userId, "access");
    const refreshToken = generateToken(userId, "refresh");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + getInMilliSec(applicationConfig.app.jwt_refresh_expiry as StringValue));

    const hashedRefreshToken = hashToken(refreshToken);

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

    const refreshMaxAge = applicationConfig.app.jwt_refresh_expiry ?
        getInMilliSec(applicationConfig.app.jwt_refresh_expiry as StringValue) : 10 * 24 * 60 * 60 * 1000;

    res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: applicationConfig.app.environment === "production",
        maxAge: refreshMaxAge,
        sameSite: "strict"
    });

    return { accessToken, refreshToken };
};

export const verifyAndRefreshSession = async (
    refreshToken: string | undefined,
    res: Response,
    expiredAccessToken?: string
): Promise<RefreshSessionResult> => {
    if (!refreshToken) {
        throw new AuthError("Please login again.", 401);
    }

    const db = getPostgresDb();

    if (expiredAccessToken) {
        const accessTokenPayload = decodeToken(expiredAccessToken);
        if (!accessTokenPayload || !accessTokenPayload.userId) {
            throw new AuthError("Invalid token", 401);
        }
        const refreshTokenPayload = decodeToken(refreshToken);
        if (!refreshTokenPayload || !refreshTokenPayload.userId) {
            throw new AuthError("Invalid token", 401);
        }
        if (accessTokenPayload.userId !== refreshTokenPayload.userId) {
            throw new AuthError("Invalid token.", 401);
        }
    }

    let payload: JwtPayload;
    try {
        payload = verifyToken(refreshToken, "refresh");
    } catch (error: any) {
        if (error instanceof jwt.TokenExpiredError) {
            const decoded = decodeToken(refreshToken);
            if (decoded?.userId) {
                await db.delete(refreshTokens).where(eq(refreshTokens.userId, decoded.userId));
            }
            res.clearCookie("refresh_token");
            throw new AuthError("Session expired, please login again.", 401);
        }
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
            res.clearCookie("refresh_token");
            throw new AuthError("Invalid session, please login again.", 401);
        }
        throw new AuthError("Authentication error.", 401);
    }

    if (!payload || !payload.userId) {
        throw new AuthError("Invalid token", 401);
    }

    const existingHashedRefreshTokens = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, payload.userId))
        .limit(1);

    const storedRefreshToken = existingHashedRefreshTokens[0];
    if (!storedRefreshToken) {
        res.clearCookie("refresh_token");
        throw new AuthError("Session expired, please login again.", 401);
    }

    const isMatched = verifyHashedToken(refreshToken, storedRefreshToken.token_hash);
    if (!isMatched) {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, payload.userId));
        res.clearCookie("refresh_token");
        throw new AuthError("Invalid token", 401);
    }

    const userList = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

    const user = userList[0];
    if (!user) {
        throw new AuthError("Invalid user session.", 401);
    }

    const { accessToken } = await issueTokensAndSetCookie(user.id, res);

    return {
        user: {
            id: user.id,
            userName: user.userName,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
        },
        accessToken,
    };
};
