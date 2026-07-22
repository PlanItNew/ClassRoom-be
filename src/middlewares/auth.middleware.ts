import { eq } from "drizzle-orm";
import { getPostgresDb } from "../database/db.js";
import { users, refreshTokens } from "../database/schema.js";
import { verifyToken, decodeToken, generateToken, verifyHashedToken } from "../utils/auth.utils.js";
import { applicationConfig } from "../config/index.js";
import { getInMilliSec } from "../utils/common.utils.js";

// Types 
import { type StringValue } from "ms";
import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";



// Types 
import type { AuthenticatedRequest } from "../constants/types.js";


const { JsonWebTokenError, TokenExpiredError, NotBeforeError } = jwt;

export const authenticateToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    const db = getPostgresDb();
    const token =
        req.cookies?.jwt ||
        (req.headers["authorization"] && req.headers["authorization"].split(" ")[1]);

    if (!token) {
        return res.status(401).json({ message: "Unauthorized." });
    }

    try {
        const payload = verifyToken(token, "access");
        const userList = await db
            .select()
            .from(users)
            .where(eq(users.id, payload.userId))
            .limit(1);

        const user = userList[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid token user." });
        }

        req.user = {
            id: user.id,
            role: user.role,
            email: user.email,
            userName: user.userName,
        };
        return next();
    } catch (error: any) {
        if (error instanceof TokenExpiredError) {
            // Token is expired. 
            const accessTokenPayload = decodeToken(token);
            if (!accessTokenPayload || !accessTokenPayload.userId) {
                return res.status(401).json({ message: "Invalid token" })
            }
            try {
                const refreshToken = req.cookies?.refresh_token;
                if (!refreshToken) {
                    return res.status(401).json({ message: "Please login again." })
                }

                verifyToken(refreshToken, "refresh");

                const refreshTokenPayload = decodeToken(refreshToken);
                if (!refreshTokenPayload || !refreshTokenPayload.userId) {
                    return res.status(401).json({ message: "Invalid token" })
                }
                if (accessTokenPayload.userId !== refreshTokenPayload.userId) {
                    return res.status(401).json({ message: "Invalid token." })
                }

                const existingHashedRefreshTokens = await db
                    .select()
                    .from(refreshTokens)
                    .where(eq(refreshTokens.userId, refreshTokenPayload.userId))
                    .limit(1);

                const storedRefreshToken = existingHashedRefreshTokens[0];
                if (!storedRefreshToken) {
                    return res.status(401).json({ message: "Session expired, please login again." });
                }

                // Verify the refresh token hash against stored hash
                const isMatchedRefreshToken = verifyHashedToken(refreshToken, storedRefreshToken.token_hash);
                if (!isMatchedRefreshToken) {
                    return res.status(401).json({ message: "Invalid token" })
                }

                // Fetch user
                const userList = await db
                    .select()
                    .from(users)
                    .where(eq(users.id, refreshTokenPayload.userId))
                    .limit(1);

                const user = userList[0];
                if (!user) {
                    return res.status(401).json({ message: "Invalid user session." });
                }

                // Re-issue access token (30 mins)
                const newAccessToken = generateToken(refreshTokenPayload.userId, "access");

                res.cookie("jwt", newAccessToken, {
                    httpOnly: true,
                    secure: applicationConfig.app.environment === "production",
                    maxAge: getInMilliSec(applicationConfig.app.jwt_access_expiry as StringValue),
                    sameSite: "strict"
                });

                req.user = {
                    id: user.id,
                    role: user.role,
                    email: user.email,
                    userName: user.userName,
                };

                return next();
            } catch (refreshError: any) {
                if (refreshError instanceof TokenExpiredError) {
                    await db.delete(refreshTokens).where(eq(refreshTokens.userId, accessTokenPayload.userId));
                    return res.status(401).json({ message: "Session expired, please login again." });
                }
                if (refreshError instanceof JsonWebTokenError || refreshError instanceof NotBeforeError) {
                    return res.status(401).json({ message: "Invalid session, please login again." });
                }
                console.error("Auth Middleware Error:", error);
                return res.status(401).json({ message: "Internal Server Error." });
            }
        }
        else if (error instanceof NotBeforeError) {
            return res.status(401).json({ message: "Token is not active yet. Try again later." })
        }
        else if (error instanceof JsonWebTokenError) {
            return res.status(401).json({ message: "Invalid token." })
        }
        else {
            return res.status(401).json({ message: "Internal Server Error." });
        }
    }
};

export const requireRole = (role: "TEACHER" | "STUDENT") => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ message: "Access denied: Unauthorized role." });
        }
        next();
    };
};
