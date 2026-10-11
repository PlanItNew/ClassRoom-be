import { applicationConfig } from "../config/index.js";
import { Worker, Job } from "bullmq";
import { bullMqQueues } from "../constants/constants.js";
import { deleteS3Objects } from "../services/s3AWS.js";
import { logger } from "../utils/common.utils.js";

export let s3CleanupWorker: Worker | null = null;

export const initS3CleanupWorker = (): Worker => {
    if (!s3CleanupWorker) {
        s3CleanupWorker = new Worker(
            bullMqQueues.S3_CLEANUP,
            async (job: Job) => {
                const { keys } = job.data;
                logger("info", "S3CleanupWorker", `Processing S3 cleanup job ${job.id} with ${keys?.length || 0} keys`);
                if (Array.isArray(keys) && keys.length > 0) {
                    await deleteS3Objects(keys);
                    logger("info", "S3CleanupWorker", `Successfully removed ${keys.length} S3 objects in job ${job.id}`);
                }
            },
            {
                connection: {
                    ...applicationConfig.redis,
                },
            }
        );

        s3CleanupWorker.on("completed", (job: Job) => {
            console.log(`[S3CleanupWorker] Job ${job.id} completed successfully`);
        });

        s3CleanupWorker.on("failed", (job: Job | undefined, err: Error) => {
            console.error(`[S3CleanupWorker] Job ${job?.id} failed:`, err.message || err);
        });

        s3CleanupWorker.on("error", (err: Error) => {
            console.error("[S3CleanupWorker] Worker error:", err.message || err);
        });

        console.log("Initialized S3 Cleanup Worker");
    }
    return s3CleanupWorker;
};

export const closeS3CleanupWorker = async (): Promise<void> => {
    if (s3CleanupWorker) {
        await s3CleanupWorker.close();
        s3CleanupWorker = null;
        console.log("S3 cleanup worker closed successfully");
    }
};
