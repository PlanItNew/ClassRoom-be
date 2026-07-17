import type { Request, Response } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "../database/db.js";
import { users, refreshTokens } from "../database/schema.js";
import {
    hashSensitiveData,
    verifySensitiveData,
    issueTokensAndSetCookie,
} from "../utils/auth.utils.js";
import type { AuthenticatedRequest } from "../../constants/types.js";

export const registerUser = async (req: Request, res: Response) => {
    try {
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

        const hashedPassword = await hashSensitiveData(password);
        let createdUsers;
        // Atomic transaction is used to avoid race condition
        try {
            createdUsers = await db.transaction(async (tx) => {
                const user = await tx.insert(users)
                    .values({
                        userName,
                        email,
                        password: hashedPassword,
                        fullName,
                        role,
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

        await issueTokensAndSetCookie(newUser.id, res);

        return res.status(201).json({
            message: "User registered successfully",
            user: {
                id: newUser.id,
                userName: newUser.userName,
                email: newUser.email,
                fullName: newUser.fullName,
                role: newUser.role,
            },
        });
    } catch (error: any) {
        console.error("Error in registerUser:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const loginUser = async (req: Request, res: Response) => {
    try {
        const { userName, password } = req.body;

        if (!userName || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }

        const userList = await db
            .select()
            .from(users)
            .where(eq(users.userName, userName))
            .limit(1);

        const user = userList[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const isPasswordValid = await verifySensitiveData(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        await issueTokensAndSetCookie(user.id, res);

        return res.status(200).json({
            message: "Login successful",
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

export const logoutUser = async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

        res.clearCookie("jwt");
        res.clearCookie("refresh_token");

        return res.status(200).json({ message: "Logged out successfully" });
    } catch (error: any) {
        console.error("Error in logoutUser:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
