import { initEmailQueue, closeEmailQueue } from "./email.queue.js";
import { initS3CleanupQueue, closeS3CleanupQueue } from "./s3Cleanup.queue.js";
import { initExamGenerationQueue, initExamSchedulerQueue, closeExamQueues } from "./exam.queue.js";

export * from "./email.queue.js";
export * from "./s3Cleanup.queue.js";
export * from "./exam.queue.js";

/**
 * Starts and initializes all BullMQ queues in the application.
 * Add any new queues here to be initialized during server startup.
 */
export const startAllQueues = async (): Promise<void> => {
    try {
        console.log("Starting BullMQ Queues...");
        initEmailQueue();
        initS3CleanupQueue();
        initExamGenerationQueue();
        initExamSchedulerQueue();
        console.log("✅ All queues initialized successfully");
    } catch (error: any) {
        console.error("Failed to initialize queues:", error.message || error);
        throw error;
    }
};

/**
 * Gracefully closes all BullMQ queues.
 */
export const closeAllQueues = async (): Promise<void> => {
    try {
        console.log("Closing all BullMQ Queues...");
        await Promise.allSettled([
            closeEmailQueue(),
            closeS3CleanupQueue(),
            closeExamQueues(),
        ]);
        console.log("✅ All queues closed");
    } catch (error: any) {
        console.error("Error closing queues:", error.message || error);
    }
};