import type { Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../database/db.js";
import { users, refreshTokens } from "../database/schema.js";
import { verifyToken, decodeToken, generateAccessToken } from "../utils/auth.utils.js";

// Types 
import type { AuthenticatedRequest } from "../../constants/types.js";

export const authenticateToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    const token =
        req.cookies?.jwt ||
        (req.headers["authorization"] && req.headers["authorization"].split(" ")[1]);

    if (!token) {
        return res.status(401).json({ message: "Unauthorized " });
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
            return res.status(401).json({ message: "Invalid token user" });
        }

        req.user = {
            id: user.id,
            role: user.role,
            email: user.email,
            userName: user.userName,
        };
        return next();
    } catch (err: any) {
        // Token verification failed or expired. Attempt to refresh using refresh token from DB.
        const decodedPayload = decodeToken(token);
        if (!decodedPayload || !decodedPayload.userId) {
            return res.status(401).json({ message: "Invalid access token" });
        }

        try {
            const userId = decodedPayload.userId;
            const existingRefreshTokens = await db
                .select()
                .from(refreshTokens)
                .where(eq(refreshTokens.userId, userId))
                .limit(1);

            const storedRefreshToken = existingRefreshTokens[0];
            if (!storedRefreshToken) {
                return res.status(401).json({ message: "Session expired, please login again" });
            }

            if (new Date(storedRefreshToken.expiresAt) <= new Date()) {
                // Refresh token expired in DB, clean it up
                await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
                return res.status(401).json({ message: "Refresh token expired, please login again" });
            }

            // Verify the refresh token signature
            verifyToken(storedRefreshToken.token, "refresh");

            // Fetch user
            const userList = await db
                .select()
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            const user = userList[0];
            if (!user) {
                return res.status(401).json({ message: "Invalid user session" });
            }

            // Re-issue access token (30 mins)
            const newAccessToken = generateAccessToken(userId);

            res.cookie("jwt", newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                maxAge: 30 * 60 * 1000,
            });

            req.user = {
                id: user.id,
                role: user.role,
                email: user.email,
                userName: user.userName,
            };

            return next();
        } catch (refreshErr) {
            return res.status(401).json({ message: "Invalid refresh session, please login again" });
        }
    }
};

export const requireRole = (role: "TEACHER" | "STUDENT") => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ message: "Access denied: Unauthorized role" });
        }
        next();
    };
};
