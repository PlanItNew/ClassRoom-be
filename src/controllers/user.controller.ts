import { getPostgresDb } from "../database/db.js";
import { users } from "../database/schema.js";
import { eq } from "drizzle-orm";

import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../constants/types.js";


export const deleteUser = async (req: Request, res: Response) => {
    try {
        const db = getPostgresDb();
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }
        await db.delete(users).where(eq(users.id, userId));
        res.clearCookie("jwt");
        res.clearCookie("refresh_token");
        return res.status(200).json({ message: "User deleted successfully" });
    } catch (error: any) {
        res.status(500).json({ message: "Internal server error" });
    }
}

export const updateDetails = async (req: Request, res: Response) => {
    try {
        const db = getPostgresDb();
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }
        const { fullName, phoneNumber } = req.body;

        const userList = await db.select().from(users).where(eq(users.id, userId));

        const user = userList[0];

        if (!user) {
            return res.status(400).json({ message: "User not found" })
        }

        const updatedFullName = !fullName ? user.fullName : fullName;
        const updatedPhoneNumber = !phoneNumber ? user.phoneNumber : phoneNumber;

        if (updatedFullName === user.fullName && updatedPhoneNumber === user.phoneNumber) {
            return res.status(400).json({ message: "No changes to update" })
        }

        const result = await db.update(users).set({
            fullName: updatedFullName,
            phoneNumber: updatedPhoneNumber
        }).where(eq(users.id, userId));

        if (!result) {
            return res.status(400).json({ message: "Failed to update user" });
        }

        return res.status(200).json({ message: "User updated successfully" });

    } catch (error: any) {
        res.status(500).json({ message: "Internal Server Error" })
    }
}
