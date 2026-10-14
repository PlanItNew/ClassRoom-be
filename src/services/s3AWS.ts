import {
    S3Client,
    HeadObjectCommand,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectsCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { applicationConfig } from "../config/index.js";
import crypto from "crypto";

const s3Config = applicationConfig.s3;

let s3Client: S3Client | null = null;

/**
 * Lazily initialise and return the singleton S3 client.
 */
export const getS3Client = (): S3Client => {
    if (!s3Client) {
        s3Client = new S3Client(s3Config.clientConfig);
    }
    return s3Client;
};

/**
 * Build a deterministic but collision-free S3 key for an attachment.
 * Format: classrooms/{classroomId}/posts/{postId}/{uuid}-{sanitisedFilename}
 */
export const buildS3Key = (
    classroomId: string,
    postId: string,
    originalFilename: string
): string => {
    const id = crypto.randomUUID();
    const sanitised = originalFilename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 200);
    return `classrooms/${classroomId}/posts/${postId}/${id}-${sanitised}`;
};

/**
 * Build a deterministic S3 key for an exam topic PDF.
 * Format: classrooms/{classroomId}/exams/{examId}/{uuid}-{sanitisedFilename}
 */
export const buildExamS3Key = (
    classroomId: string,
    examId: string,
    originalFilename: string
): string => {
    const id = crypto.randomUUID();
    const sanitised = originalFilename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 200);
    return `classrooms/${classroomId}/exams/${examId}/${id}-${sanitised}`;
};

/**
 * Generate a presigned PUT URL so the frontend can upload directly to S3.
 */
export const generatePresignedPutUrl = async (
    s3Key: string,
    mimeType?: string,
    sizeBytes?: number
): Promise<string> => {
    const client = getS3Client();
    const params: any = {
        Bucket: s3Config.bucketName,
        Key: s3Key,
    };
    if (mimeType) {
        params.ContentType = mimeType;
    }
    if (sizeBytes) {
        params.ContentLength = sizeBytes;
    }

    const command = new PutObjectCommand(params);
    const url = await getSignedUrl(client, command, {
        expiresIn: s3Config.putUrlExpirySeconds,
    });
    return url;
};

/**
 * Check whether an object exists in S3 by issuing a HEAD request.
 * Returns `true` if the object exists, `false` otherwise.
 */
export const doesObjectExist = async (s3Key: string): Promise<boolean> => {
    const client = getS3Client();
    try {
        await client.send(
            new HeadObjectCommand({
                Bucket: s3Config.bucketName,
                Key: s3Key,
            })
        );
        return true;
    } catch (err: any) {
        if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw err; // unexpected error – bubble up
    }
};

/**
 * Generate a presigned GET URL to view/download an attachment from S3 (default: 30 minutes).
 */
export const generatePresignedGetUrl = async (
    s3Key: string,
    expiresInSeconds: number = 1800 // 30 minutes
): Promise<string> => {
    const client = getS3Client();
    const command = new GetObjectCommand({
        Bucket: s3Config.bucketName,
        Key: s3Key,
    });
    return getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
    });
};

/**
 * Delete a batch of objects from S3.
 * AWS DeleteObjectsCommand supports up to 1000 objects in a single batch.
 */
export const deleteS3Objects = async (keys: string[]): Promise<void> => {
    if (!keys || keys.length === 0) return;
    const client = getS3Client();

    // Chunk into batches of up to 1000 keys (AWS S3 limit)
    const chunkSize = 1000;
    for (let i = 0; i < keys.length; i += chunkSize) {
        const chunk = keys.slice(i, i + chunkSize);
        const command = new DeleteObjectsCommand({
            Bucket: s3Config.bucketName,
            Delete: {
                Objects: chunk.map((Key) => ({ Key })),
                Quiet: true,
            },
        });
        await client.send(command);
    }
};

/**
 * Delete a single object from S3.
 */
export const deleteS3Object = async (key: string): Promise<void> => {
    if (!key) return;
    const client = getS3Client();
    const command = new DeleteObjectCommand({
        Bucket: s3Config.bucketName,
        Key: key,
    });
    await client.send(command);
};

