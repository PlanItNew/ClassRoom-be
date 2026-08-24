import { Queue } from "bullmq";
import { applicationConfig } from "../config/index.js";
import { bullMqQueues } from "../constants/constants.js";

let emailQueue: Queue;

export const initEmailQueue = (): Queue => {
    if (!emailQueue) {
        emailQueue = new Queue(bullMqQueues.EMAIL, {
            connection: applicationConfig.redis,
            defaultJobOptions: {
                removeOnComplete: 5000,
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
            },
        });

        emailQueue.on("error", (err) => {
            console.error("Email queue error:", err);
        });

        console.log("Initialized Email Queue");
    }
    return emailQueue;
};

export const getEmailQueue = (): Queue => {
    if (!emailQueue) {
        return initEmailQueue();
    }
    return emailQueue;
};

export const closeEmailQueue = async (): Promise<void> => {
    if (emailQueue) {
        await emailQueue.close();
        console.log("Email queue closed successfully");
    }
};