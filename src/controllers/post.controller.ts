import { getPostgresDb } from "../database/db.js";
import type { AuthenticatedRequest } from "../constants/types.js";
import { type Response } from "express";
import { logger, makeRedisKey } from "../utils/common.utils.js";
import { getValue, putValue, deleteKey } from "../redis/redis.api.js";
import { getS3CleanupQueue } from "../queues/s3Cleanup.queue.js";
import {
    classrooms,
    classroomStudents,
    classroomPost,
    attachments,
} from "../database/schema.js";
import { and, eq, desc, sql } from "drizzle-orm";
import {
    buildS3Key,
    generatePresignedPutUrl,
    generatePresignedGetUrl,
    doesObjectExist,
} from "../services/s3AWS.js";

/**
 * Invalidate cached posts in Redis for a given classroom
 */
export const invalidateClassroomPostsCache = async (classroomId: string) => {
    try {
        const key = makeRedisKey("CLASSROOM_POSTS", classroomId);
        await deleteKey(key);
    } catch (err) {
        logger("error", "invalidateClassroomPostsCache", err);
    }
};


// ───────────────────────── 1. CREATE POST (DRAFT) ─────────────────────────
export const createPost = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        const teacherId = req.user!.id;

        if (!classroomId) {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        // Verify classroom exists and belongs to the requesting teacher
        const classroomRows = await db
            .select({ id: classrooms.id, teacherId: classrooms.teacherId })
            .from(classrooms)
            .where(eq(classrooms.id, classroomId))
            .limit(1);

        if (classroomRows.length === 0) {
            return res.status(404).json({ message: "Classroom not found" });
        }

        if (classroomRows[0].teacherId !== teacherId) {
            return res.status(403).json({ message: "You are not the teacher of this classroom" });
        }

        const { content } = req.body;
        if (!content || typeof content !== "string" || content.trim().length === 0) {
            return res.status(400).json({ message: "Post content is required" });
        }

        const [post] = await db.insert(classroomPost).values({
            classroomId,
            teacherId,
            content: content.trim(),
            status: "DRAFT",
        }).returning();

        return res.status(201).json({
            message: "Draft post created successfully",
            data: post,
        });
    } catch (error) {
        logger("error", "createPost", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


// ───────────────── 2. CREATE ATTACHMENTS + PRESIGNED URLS ──────────────────
export const createAttachments = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const postId = req.params.postId as string;
        const teacherId = req.user!.id;

        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }

        // Verify post exists, is a DRAFT, and belongs to this teacher
        const postRows = await db
            .select({
                id: classroomPost.id,
                teacherId: classroomPost.teacherId,
                classroomId: classroomPost.classroomId,
                status: classroomPost.status,
            })
            .from(classroomPost)
            .where(eq(classroomPost.id, postId))
            .limit(1);

        if (postRows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        const post = postRows[0];

        if (post.teacherId !== teacherId) {
            return res.status(403).json({ message: "You are not the owner of this post" });
        }

        if (post.status !== "DRAFT") {
            return res.status(400).json({ message: "Attachments can only be added to draft posts" });
        }

        const { files } = req.body;
        if (!files || !Array.isArray(files)) {
            return res.status(400).json({ message: "Files array is required and cannot be empty" });
        }

        // Process all files in a single batch
        const results = await Promise.all(
            files.map(async (file: { originalFilename: string; mimeType?: string; sizeBytes?: number }) => {
                if (!file.originalFilename) {
                    throw new Error("Each file must have an originalFilename");
                }

                const s3Key = buildS3Key(post.classroomId, post.id, file.originalFilename);
                const presignedUrl = await generatePresignedPutUrl(s3Key, file.mimeType, file.sizeBytes);

                const [attachment] = await db.insert(attachments).values({
                    postId: post.id,
                    s3Key,
                    originalFilename: file.originalFilename,
                    mimeType: file.mimeType || null,
                    sizeBytes: file.sizeBytes || null,
                    status: "PENDING_UPLOAD",
                }).returning();

                return {
                    ...attachment,
                    presignedUrl,
                };
            })
        );

        return res.status(201).json({
            message: "Attachments created with presigned URLs",
            data: results,
        });
    } catch (error: any) {
        logger("error", "createAttachments", error);
        if (error.message?.includes("originalFilename")) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Internal server error" });
    }
};


// ─────────────────────── 2.5. VERIFY ATTACHMENTS IN S3 ─────────────────────
export const verifyAttachments = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const postId = req.params.postId as string;
        const teacherId = req.user!.id;

        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }

        const postRows = await db
            .select({
                id: classroomPost.id,
                teacherId: classroomPost.teacherId,
                status: classroomPost.status,
            })
            .from(classroomPost)
            .where(eq(classroomPost.id, postId))
            .limit(1);

        if (postRows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        if (postRows[0].teacherId !== teacherId) {
            return res.status(403).json({ message: "You are not the owner of this post" });
        }

        // Fetch all pending attachments for this post
        const pendingAttachments = await db
            .select()
            .from(attachments)
            .where(
                and(
                    eq(attachments.postId, postId),
                    eq(attachments.status, "PENDING_UPLOAD")
                )
            );

        const verificationResults = await Promise.all(
            pendingAttachments.map(async (att: { id: string; s3Key: string }) => ({
                id: att.id,
                s3Key: att.s3Key,
                exists: await doesObjectExist(att.s3Key),
            }))
        );

        const missing = verificationResults.filter((r) => !r.exists);
        if (missing.length > 0) {
            return res.status(400).json({
                message: "Some attachments have not been uploaded to S3 yet",
                missingAttachments: missing.map((m) => ({
                    id: m.id,
                    s3Key: m.s3Key,
                })),
                verified: false,
            });
        }

        const now = new Date();
        if (pendingAttachments.length > 0) {
            await db
                .update(attachments)
                .set({
                    status: "UPLOADED",
                    uploadedAt: now,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(attachments.postId, postId),
                        eq(attachments.status, "PENDING_UPLOAD")
                    )
                );
        }

        return res.status(200).json({
            message: "All attachments verified successfully in S3",
            verified: true,
        });
    } catch (error) {
        logger("error", "verifyAttachments", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


// ─────────────────────── 3. PUBLISH POST ───────────────────────────────────
export const publishPost = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const postId = req.params.postId as string;
        const teacherId = req.user!.id;

        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }

        // Verify post is a DRAFT and belongs to this teacher
        const postRows = await db
            .select({
                id: classroomPost.id,
                teacherId: classroomPost.teacherId,
                classroomId: classroomPost.classroomId,
                status: classroomPost.status,
            })
            .from(classroomPost)
            .where(eq(classroomPost.id, postId))
            .limit(1);

        if (postRows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        const post = postRows[0];

        if (post.teacherId !== teacherId) {
            return res.status(403).json({ message: "You are not the owner of this post" });
        }

        if (post.status !== "DRAFT") {
            return res.status(400).json({ message: "Only draft posts can be published" });
        }

        const now = new Date();

        // Mark post as PUBLISHED
        const [publishedPost] = await db
            .update(classroomPost)
            .set({
                status: "PUBLISHED",
                publishedAt: now,
                updatedAt: now,
            })
            .where(eq(classroomPost.id, postId))
            .returning();

        // Fetch the final attachments list with 30-min presigned GET URLs
        const finalAttachments = await db
            .select()
            .from(attachments)
            .where(eq(attachments.postId, postId));

        const finalWithUrls = await Promise.all(
            finalAttachments.map(async (att: any) => ({
                ...att,
                url: await generatePresignedGetUrl(att.s3Key, 1800),
            }))
        );

        // Invalidate Redis cache for this classroom's posts
        await invalidateClassroomPostsCache(post.classroomId);

        return res.status(200).json({
            message: "Post published successfully",
            data: {
                ...publishedPost,
                attachments: finalWithUrls,
            },
        });
    } catch (error) {
        logger("error", "publishPost", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


// ─────────────────────── 4. GET POSTS (Published) ──────────────────────────
export const getPosts = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        const userId = req.user!.id;
        const userRole = req.user!.role;

        if (!classroomId) {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        // Verify classroom exists (try Redis cache first, fallback to DB)
        const classroomRedisKey = makeRedisKey("CLASSROOM", classroomId);
        let classroom = await getValue(classroomRedisKey);

        if (!classroom) {
            const classroomRows = await db
                .select({ id: classrooms.id, teacherId: classrooms.teacherId })
                .from(classrooms)
                .where(eq(classrooms.id, classroomId))
                .limit(1);

            if (classroomRows.length === 0) {
                return res.status(404).json({ message: "Classroom not found" });
            }

            classroom = classroomRows[0];
            await putValue(classroomRedisKey, classroom, "CLASSROOM");
        }

        // Authorisation: teacher of this classroom OR approved student
        if (userRole === "TEACHER") {
            if (classroom.teacherId !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }
        } else {
            // Student must be an approved member
            const membership = await db
                .select({ status: classroomStudents.status })
                .from(classroomStudents)
                .where(
                    and(
                        eq(classroomStudents.classroomId, classroomId),
                        eq(classroomStudents.studentId, userId)
                    )
                )
                .limit(1);

            if (membership.length === 0 || membership[0].status !== "APPROVED") {
                return res.status(403).json({ message: "You are not a member of this classroom" });
            }
        }

        // 1. Check if the classroom's posts are cached in Redis
        const postsCacheKey = makeRedisKey("CLASSROOM_POSTS", classroomId);
        let allPosts = await getValue(postsCacheKey);

        if (!allPosts) {
            // Cache miss: Fetch all published posts and their attachments from DB
            const dbPosts = await db
                .select()
                .from(classroomPost)
                .where(
                    and(
                        eq(classroomPost.classroomId, classroomId),
                        eq(classroomPost.status, "PUBLISHED")
                    )
                )
                .orderBy(desc(classroomPost.createdAt));

            const postIds = dbPosts.map((p: { id: string }) => p.id);
            let rawAttachments: any[] = [];
            if (postIds.length > 0) {
                rawAttachments = await db
                    .select()
                    .from(attachments)
                    .where(
                        and(
                            sql`${attachments.postId} IN (${sql.join(postIds.map((id: string) => sql`${id}`), sql`, `)})`,
                            eq(attachments.status, "UPLOADED")
                        )
                    );
            }

            // Group attachments by postId (raw attachment data with s3Key, no presigned URLs)
            const attachmentsByPost = new Map<string, any[]>();
            for (const att of rawAttachments) {
                const list = attachmentsByPost.get(att.postId) || [];
                list.push(att);
                attachmentsByPost.set(att.postId, list);
            }

            allPosts = dbPosts.map((post: { id: string; [key: string]: any }) => ({
                ...post,
                attachments: attachmentsByPost.get(post.id) || [],
            }));

            // Cache raw post details in Redis
            await putValue(postsCacheKey, allPosts, "CLASSROOM_POSTS");
        }

        // 2. Apply pagination limits
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
        const total = allPosts.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const pagedPosts = allPosts.slice(startIndex, endIndex);

        // 3. Generate fresh pre-signed GET URLs for every request for attachments
        const postsWithUrls = await Promise.all(
            pagedPosts.map(async (post: any) => {
                const attachmentsWithUrls = await Promise.all(
                    (post.attachments || []).map(async (att: any) => ({
                        ...att,
                        url: await generatePresignedGetUrl(att.s3Key, 1800),
                    }))
                );
                return {
                    ...post,
                    attachments: attachmentsWithUrls,
                };
            })
        );

        return res.status(200).json({
            message: "Posts fetched successfully",
            data: postsWithUrls,
            pagination: {
                page,
                limit,
                total,
                totalPages,
            },
        });
    } catch (error) {
        logger("error", "getPosts", error);
        return res.status(500).json({ message: "Internal server error", error: error });
    }
};


// ─────────────────────── 5. UPDATE POST ────────────────────────────────────
export const updatePost = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const postId = req.params.postId as string;
        const teacherId = req.user!.id;

        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }

        // Verify post exists and belongs to this teacher
        const postRows = await db
            .select({
                id: classroomPost.id,
                teacherId: classroomPost.teacherId,
                classroomId: classroomPost.classroomId,
            })
            .from(classroomPost)
            .where(eq(classroomPost.id, postId))
            .limit(1);

        if (postRows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        if (postRows[0].teacherId !== teacherId) {
            return res.status(403).json({ message: "You are not the owner of this post" });
        }

        const { content } = req.body;
        if (!content || typeof content !== "string" || content.trim().length === 0) {
            return res.status(400).json({ message: "Post content is required for update" });
        }

        const [updatedPost] = await db
            .update(classroomPost)
            .set({
                content: content.trim(),
                updatedAt: new Date(),
            })
            .where(eq(classroomPost.id, postId))
            .returning();

        // Invalidate Redis cache for this classroom's posts
        await invalidateClassroomPostsCache(postRows[0].classroomId);

        return res.status(200).json({
            message: "Post updated successfully",
            data: updatedPost,
        });
    } catch (error) {
        logger("error", "updatePost", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


// ─────────────────────── 6. DELETE POST ────────────────────────────────────
export const deletePost = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const postId = req.params.postId as string;
        const teacherId = req.user!.id;

        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }

        // Verify post exists and belongs to this teacher
        const postRows = await db
            .select({
                id: classroomPost.id,
                teacherId: classroomPost.teacherId,
                classroomId: classroomPost.classroomId,
            })
            .from(classroomPost)
            .where(eq(classroomPost.id, postId))
            .limit(1);

        if (postRows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        const post = postRows[0];

        if (post.teacherId !== teacherId) {
            return res.status(403).json({ message: "You are not the owner of this post" });
        }

        // Fetch all attachments for this post before deletion so we have their S3 keys
        const postAttachmentsList = await db
            .select({ s3Key: attachments.s3Key })
            .from(attachments)
            .where(eq(attachments.postId, postId));

        const s3Keys = postAttachmentsList
            .map((att: { s3Key: string }) => att.s3Key)
            .filter((k: string | null | undefined): k is string => Boolean(k));

        // If attachments exist in S3, enqueue background cleanup in BullMQ
        if (s3Keys.length > 0) {
            try {
                const s3CleanupQueue = getS3CleanupQueue();
                await s3CleanupQueue.add("delete-s3-objects", {
                    postId,
                    classroomId: post.classroomId,
                    keys: s3Keys,
                });
                logger("info", "deletePost", `Enqueued S3 deletion for ${s3Keys.length} files of post ${postId}`);
            } catch (queueErr) {
                logger("error", "deletePost:queueFailed", queueErr);
            }
        }

        // Delete post cascades to attachments in DB via foreign key
        await db
            .delete(classroomPost)
            .where(eq(classroomPost.id, postId));

        // Invalidate Redis cache for this classroom's posts
        await invalidateClassroomPostsCache(post.classroomId);

        return res.status(200).json({
            message: "Post deleted successfully",
        });
    } catch (error) {
        logger("error", "deletePost", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};