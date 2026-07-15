import { Router } from "express";
import { createClassroom, getClassrooms, joinClassroom } from "../controllers/classroom.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticateToken);
router.post("/", createClassroom);
router.get("/", getClassrooms);
router.post("/join", joinClassroom);

export default router;
