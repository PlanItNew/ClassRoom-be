import { initEmailWorker, closeEmailWorker } from "./email.worker.js";
import { initS3CleanupWorker, closeS3CleanupWorker } from "./s3Cleanup.worker.js";

export * from "./email.worker.js";
export * from "./s3Cleanup.worker.js";

/**
 * Starts and initializes all BullMQ workers in the application.
 * Add any new workers here to be initialized during server startup.
 */
export const startAllWorkers = async (): Promise<void> => {
    try {
        console.log("Starting BullMQ Workers...");
        initEmailWorker();
        initS3CleanupWorker();
        console.log("✅ All workers started successfully");
    } catch (error: any) {
        console.error("Failed to start workers:", error.message || error);
        throw error;
    }
};

/**
 * Gracefully closes all BullMQ workers.
 */
export const closeAllWorkers = async (): Promise<void> => {
    try {
        console.log("Closing all BullMQ Workers...");
        await Promise.allSettled([
            closeEmailWorker(),
            closeS3CleanupWorker(),
        ]);
        console.log("✅ All workers closed");
    } catch (error: any) {
        console.error("Error closing workers:", error.message || error);
    }
};
