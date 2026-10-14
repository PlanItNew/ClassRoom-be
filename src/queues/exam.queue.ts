import { Queue } from "bullmq";
import { applicationConfig } from "../config/index.js";
import { bullMqQueues } from "../constants/constants.js";

let examGenerationQueue: Queue | null = null;
let examSchedulerQueue: Queue | null = null;

export const initExamGenerationQueue = (): Queue => {
    if (!examGenerationQueue) {
        examGenerationQueue = new Queue(bullMqQueues.EXAM_GENERATION, {
            connection: applicationConfig.redis,
            defaultJobOptions: {
                removeOnComplete: 1000,
                removeOnFail: 5000,
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 2000,
                },
            },
        });

        examGenerationQueue.on("error", (err) => {
            console.error("[ExamGenerationQueue] Error:", err);
        });

        console.log("Initialized Exam Generation Queue");
    }
    return examGenerationQueue;
};

export const getExamGenerationQueue = (): Queue => {
    if (!examGenerationQueue) {
        return initExamGenerationQueue();
    }
    return examGenerationQueue;
};

export const initExamSchedulerQueue = (): Queue => {
    if (!examSchedulerQueue) {
        examSchedulerQueue = new Queue(bullMqQueues.EXAM_SCHEDULER, {
            connection: applicationConfig.redis,
            defaultJobOptions: {
                removeOnComplete: 1000,
                removeOnFail: 5000,
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 2000,
                },
            },
        });

        examSchedulerQueue.on("error", (err) => {
            console.error("[ExamSchedulerQueue] Error:", err);
        });

        console.log("Initialized Exam Scheduler Queue");
    }
    return examSchedulerQueue;
};

export const getExamSchedulerQueue = (): Queue => {
    if (!examSchedulerQueue) {
        return initExamSchedulerQueue();
    }
    return examSchedulerQueue;
};

export const closeExamQueues = async (): Promise<void> => {
    if (examGenerationQueue) {
        await examGenerationQueue.close();
        examGenerationQueue = null;
        console.log("Exam generation queue closed");
    }
    if (examSchedulerQueue) {
        await examSchedulerQueue.close();
        examSchedulerQueue = null;
        console.log("Exam scheduler queue closed");
    }
};
