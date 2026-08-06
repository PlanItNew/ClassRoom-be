import { eq } from "drizzle-orm";
import { getPostgresDb } from "../database/db.js";
import { users } from "../database/schema.js";
import { verifyToken, verifyAndRefreshSession, AuthError } from "../utils/auth.utils.js";
import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthenticatedRequest } from "../constants/types.js";

const { JsonWebTokenError, TokenExpiredError, NotBeforeError } = jwt;

export const authenticateToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    const db = getPostgresDb();
    const authHeader = req.headers["authorization"];
    const token =
        (authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader) ||
        req.cookies?.jwt;

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
            try {
                const refreshToken = req.cookies?.refresh_token;
                const result = await verifyAndRefreshSession(refreshToken, res, token);

                res.setHeader("X-Access-Token", result.accessToken);
                req.user = result.user;
                return next();
            } catch (refreshErr: any) {
                if (refreshErr instanceof AuthError) {
                    return res.status(refreshErr.statusCode).json({ message: refreshErr.message });
                }
                console.error("Auth Middleware Error:", refreshErr);
                return res.status(401).json({ message: "Internal Server Error." });
            }
        } else if (error instanceof NotBeforeError) {
            return res.status(401).json({ message: "Token is not active yet. Try again later." });
        } else if (error instanceof JsonWebTokenError) {
            return res.status(401).json({ message: "Invalid token." });
        } else {
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
