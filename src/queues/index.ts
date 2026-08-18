import { initEmailQueue, closeEmailQueue } from "./email.queue.js";

export * from "./email.queue.js";

/**
 * Starts and initializes all BullMQ queues in the application.
 * Add any new queues here to be initialized during server startup.
 */
export const startAllQueues = async (): Promise<void> => {
    try {
        console.log("Starting BullMQ Queues...");
        initEmailQueue();
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
        ]);
        console.log("✅ All queues closed");
    } catch (error: any) {
        console.error("Error closing queues:", error.message || error);
    }
};