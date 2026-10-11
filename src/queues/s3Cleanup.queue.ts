import { Queue } from "bullmq";
import { applicationConfig } from "../config/index.js";
import { bullMqQueues } from "../constants/constants.js";

let s3CleanupQueue: Queue;

export const initS3CleanupQueue = (): Queue => {
    if (!s3CleanupQueue) {
        s3CleanupQueue = new Queue(bullMqQueues.S3_CLEANUP, {
            connection: applicationConfig.redis,
            defaultJobOptions: {
                removeOnComplete: 5000,
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 2000,
                },
            },
        });

        s3CleanupQueue.on("error", (err) => {
            console.error("S3 Cleanup queue error:", err);
        });

        console.log("Initialized S3 Cleanup Queue");
    }
    return s3CleanupQueue;
};

export const getS3CleanupQueue = (): Queue => {
    if (!s3CleanupQueue) {
        return initS3CleanupQueue();
    }
    return s3CleanupQueue;
};

export const closeS3CleanupQueue = async (): Promise<void> => {
    if (s3CleanupQueue) {
        await s3CleanupQueue.close();
        console.log("S3 Cleanup queue closed successfully");
    }
};
