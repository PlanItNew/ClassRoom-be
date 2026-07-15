import type { Request, Response, NextFunction } from "express";

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error(`[Error Log]: ${err.message}`, err.stack);
    res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occured.",
    });
};
