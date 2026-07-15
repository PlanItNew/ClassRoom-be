import type { Request, Response } from "express";

export const registerUser = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Registration feature to be implemented" });
};

export const loginUser = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Login feature to be implemented" });
};
