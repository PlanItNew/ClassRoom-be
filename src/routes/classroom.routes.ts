import { Router } from "express";
import { createClassroom, getClassrooms, joinClassroom, resolveRequest, bulkApproval, getPendingRequests, getApprovalStatus, getStudentsInClassroom, getClassRoomsByStudent } from "../controllers/classroom.controller.js";
import { authenticateToken, authorized } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticateToken);
router.post("/", authorized("TEACHER"), createClassroom);
router.get("/", authorized("TEACHER"), getClassrooms);
router.post("/join", authorized("STUDENT"), joinClassroom);
router.put("/resolve", authorized("TEACHER"), resolveRequest);
router.put("/bulk-approval", authorized("TEACHER"), bulkApproval);
router.get("/:classroomId/pending-requests", authorized("TEACHER"), getPendingRequests);
router.get("/:classroomId/approval-status", authorized("STUDENT"), getApprovalStatus);
router.get("/:classroomId/students", getStudentsInClassroom);
router.get("/classrooms-by-student", getClassRoomsByStudent);






export default router;
