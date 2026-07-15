import type { Request, Response } from "express";

export const createExam = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Create exam feature to be implemented" });
};

export const submitExamAttempt = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Submit exam attempt feature to be implemented" });
};

export const getExamResults = async (req: Request, res: Response) => {
    res.status(501).json({ message: "Get exam results feature to be implemented" });
};
