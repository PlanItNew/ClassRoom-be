import type { Request, Response } from "express";

export const createClassroom = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Create classroom feature to be implemented" });
};

export const getClassrooms = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Get classrooms feature to be implemented" });
};

export const joinClassroom = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Join classroom feature to be implemented" });
};
