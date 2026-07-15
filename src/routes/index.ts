import { Router } from "express";
import authRoutes from "./auth.routes.js";
import classroomRoutes from "./classroom.routes.js";
import examRoutes from "./exam.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/classrooms", classroomRoutes);
router.use("/exams", examRoutes);

export default router;
