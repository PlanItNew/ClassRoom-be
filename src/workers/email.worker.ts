import { applicationConfig } from "../config/index.js";
import { Worker, Job } from "bullmq";
import { bullMqQueues } from "../constants/constants.js";
import brevoService from "../notifications/brevoService.js";

export let emailWorker: Worker | null = null;

export const initEmailWorker = (): Worker => {
    if (!emailWorker) {
        emailWorker = new Worker(
            bullMqQueues.EMAIL,
            async (job: Job) => {
                const { to, fullName, otp, template, userAgent, ip } = job.data;
                console.log(`[EmailWorker] Processing job ${job.id} for: ${to} (template: ${template})`);
                await brevoService.sendEmail(
                    to,
                    fullName,
                    template,
                    otp,
                    userAgent,
                    ip
                );
            },
            {
                connection: {
                    ...applicationConfig.redis,
                },
            }
        );

        emailWorker.on("completed", (job: Job) => {
            console.log(`[EmailWorker] Job ${job.id} completed successfully`);
        });

        emailWorker.on("failed", (job: Job | undefined, err: Error) => {
            console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message || err);
        });

        emailWorker.on("error", (err: Error) => {
            console.error("[EmailWorker] Worker error:", err.message || err);
        });

        console.log("Initialized Email Worker");
    }
    return emailWorker;
};

export const closeEmailWorker = async (): Promise<void> => {
    if (emailWorker) {
        await emailWorker.close();
        emailWorker = null;
        console.log("Email worker closed successfully");
    }
};

