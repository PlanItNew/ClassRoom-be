import { Router } from "express";
import {
    createClassroom,
    getClassrooms,
    getClassroomById,
    updateClassroom,
    joinClassroom,
    resolveRequest,
    bulkApproval,
    getPendingRequests,
    getStudentsInClassroom,
    getClassRoomsByStudent,
    getStudentNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} from "../controllers/classroom.controller.js";
import { authenticateToken, authorized } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticateToken);

// Teacher-specific routes
router.post("/", authorized("TEACHER"), createClassroom);
router.get("/", authorized("TEACHER"), getClassrooms);
router.put("/resolve", authorized("TEACHER"), resolveRequest);
router.put("/bulk-approval", authorized("TEACHER"), bulkApproval);

// Student-specific routes
router.post("/join", authorized("STUDENT"), joinClassroom);
router.get("/student", authorized("STUDENT"), getClassRoomsByStudent);
router.get("/notifications", authorized("STUDENT"), getStudentNotifications);
router.patch("/notifications/read-all", authorized("STUDENT"), markAllNotificationsAsRead);
router.patch("/notifications/:classroomId/read", authorized("STUDENT"), markNotificationAsRead);

// Parameterized classroom routes (placed after static routes)
router.get("/:classroomId", getClassroomById);
router.put("/:classroomId", authorized("TEACHER"), updateClassroom);
router.get("/:classroomId/students", getStudentsInClassroom);
router.get("/:classroomId/pending-requests", authorized("TEACHER"), getPendingRequests);

export default router;
