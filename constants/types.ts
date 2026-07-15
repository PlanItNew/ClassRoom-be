import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        role: "TEACHER" | "STUDENT";
        email: string;
        userName?: string;
    };
}

export interface JwtPayload {
    userId: string;
    iat?: number;
    exp?: number;
}