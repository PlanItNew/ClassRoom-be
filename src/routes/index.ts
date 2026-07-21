import { Router } from "express";
import authRoutes from "./auth.routes.js";
import classroomRoutes from "./classroom.routes.js";
import examRoutes from "./exam.routes.js";
import userRoutes from "./user.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/classrooms", classroomRoutes);
router.use("/exams", examRoutes);
router.use("/user", userRoutes);

export default router;
