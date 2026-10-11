import { Router } from "express";
import {
    createPost,
    createAttachments,
    verifyAttachments,
    publishPost,
    getPosts,
    updatePost,
    deletePost,
} from "../controllers/post.controller.js";
import { authenticateToken, authorized } from "../middlewares/auth.middleware.js";

const router = Router();

// All post routes require authentication
router.use(authenticateToken);

// ── Teacher-only: Creation flow ──────────────────────────────────────────
// Step 1: Create a draft post
router.post("/:classroomId", authorized("TEACHER"), createPost);

// Step 2: Attach files to a draft post (returns presigned URLs)
router.post("/:postId/attachments", authorized("TEACHER"), createAttachments);

// Step 2.5: Verify uploaded attachments exist in S3
router.post("/:postId/verify", authorized("TEACHER"), verifyAttachments);

// Step 3: Publish the post (verifies S3 uploads, marks everything as published)
router.patch("/:postId/publish", authorized("TEACHER"), publishPost);

// ── Teacher-only: Mutation ───────────────────────────────────────────────
router.put("/:postId", authorized("TEACHER"), updatePost);
router.delete("/:postId", authorized("TEACHER"), deletePost);

// ── Both teacher & student: Read ─────────────────────────────────────────
router.get("/:classroomId", getPosts);

export default router;
