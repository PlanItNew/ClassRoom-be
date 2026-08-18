import type { Request, Response } from "express";
import { eq, or } from "drizzle-orm";
import { getPostgresDb } from "../database/db.js";
import { users, refreshTokens } from "../database/schema.js";
import {
    hashPassword,
    verifyPassword,
    issueTokensAndSetCookie,
    verifyAndRefreshSession,
    AuthError,
} from "../utils/auth.utils.js";
import { EmailTemplateType, type AuthenticatedRequest } from "../constants/types.js";

import { totpUtil } from "../utils/totp.class.js";
import brevoService from "../notifications/brevoService.js";
import { getIp, getUserAgent } from "../utils/common.utils.js";
import { verificationTypes } from "../constants/constants.js";

export const registerUser = async (req: Request, res: Response) => {
    try {
        const db = getPostgresDb();
        const { userName, email, password, fullName, role } = req.body;

        if (!userName || !email || !password || !fullName || !role) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (role !== "TEACHER" && role !== "STUDENT") {
            return res.status(400).json({ message: "Role must be TEACHER or STUDENT" });
        }

        // Check if username or email already exists
        const existingUsers = await db
            .select()
            .from(users)
            .where(or(eq(users.userName, userName), eq(users.email, email)));

        if (existingUsers.length > 0) {
            return res
                .status(409)
                .json({ message: "User with this username or email already exists" });
        }

        const hashedPassword = await hashPassword(password);
        let createdUsers;
        // Atomic transaction is used to avoid race condition
        try {
            createdUsers = await db.transaction(async (tx: any) => {
                const user = await tx.insert(users)
                    .values({
                        userName,
                        email,
                        password: hashedPassword,
                        fullName,
                        role,
                        verified: false,
                    })
                    .returning();
                return user;
            });
        } catch (insertError: any) {
            if (insertError.code === '23505') {
                return res.status(409).json({ message: "User with this username or email already exists" });
            }
            return res.status(500).json({ message: "Internal server error" });
        }

        const newUser = createdUsers[0];
        if (!newUser) {
            return res.status(500).json({ message: "Failed to create user" });
        }

        // Making user to verify to before login.
        // const { accessToken } = await issueTokensAndSetCookie(newUser.id, res);

        // Generate OTP 
        const otp = await totpUtil.generateOtp(newUser.id);

        // Currently as sycn service later upgraded to async using bull mq
        await brevoService.sendEmail(
            newUser.email,
            newUser.fullName,
            EmailTemplateType.SIGNUP_OTP,
            otp,
            getUserAgent(req),
            getIp(req)
        );

        return res.status(201).json({
            message: "User registered successfully",
            user: {
                id: newUser.id,
                verified: false,
                verificationFor: "sign-up"
            },
        });
    } catch (error: any) {
        console.error("Error in registerUser:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const loginUser = async (req: Request, res: Response) => {
    try {
        const db = getPostgresDb();
        const { userName, password, email } = req.body;

        if ((!userName && !email) || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }

        const userList = await db
            .select()
            .from(users)
            .where(or(eq(users.userName, userName), eq(users.email, email)))
            .limit(1);

        const user = userList[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const isPasswordValid = await verifyPassword(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const { accessToken } = await issueTokensAndSetCookie(user.id, res);

        return res.status(200).json({
            message: "Login successful",
            accessToken,
            user: {
                id: user.id,
                userName: user.userName,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    } catch (error: any) {
        console.error("Error in loginUser:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const refreshTokenHandler = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies?.refresh_token;
        const result = await verifyAndRefreshSession(refreshToken, res);

        return res.status(200).json({
            message: "Token refreshed successfully",
            accessToken: result.accessToken,
            user: result.user,
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error("Error in refreshTokenHandler:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const logoutUser = async (req: Request, res: Response) => {
    try {
        const db = getPostgresDb();
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

        res.clearCookie("refresh_token");

        return res.status(200).json({ message: "Logged out successfully" });
    } catch (error: any) {
        console.error("Error in logoutUser:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const verifyOTP = async (req: Request, res: Response) => {
    try {

        const db = getPostgresDb();
        const { userId, otp, verificationType } = req.body;

        if (verificationType !== "sign-up") {
            return res.status(400).json({ message: "Invalid verfication." });
        }

        if (!userId || !otp) {
            return res.status(400).json({ message: "User ID and OTP are required" });
        }

        const isOtpValid = await totpUtil.verifyOtp(userId, otp);
        if (!isOtpValid) {
            return res.status(401).json({ message: "Invalid OTP" });
        }

        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        if (verificationType === verificationTypes.SIGNUP || verificationType === verificationTypes.LOGIN) {
            const { accessToken } = await issueTokensAndSetCookie(userId, res);

            if (verificationType === verificationTypes.SIGNUP) {
                await db.update(users).set({ verified: true }).where(eq(users.id, userId));
            }

            return res.status(200).json({
                message: verificationType === verificationTypes.SIGNUP ? "User verified successfully" : "User logged in successfully",
                accessToken,
                user: {
                    id: userId,
                    role: user[0].role,
                    email: user[0].email,
                    fullName: user[0].fullName,
                    userName: user[0].userName,
                },
            });
        }
        else {
            return res.status(400).json({ message: "Invalid verification type" });
        }
    } catch (error: any) {
        console.error("Error in completeSignup:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}   
