import { BrevoClient } from "@getbrevo/brevo";
import { appConfig } from "../config/app.config.js";
import { templateMap } from "../constants/constants.js";
import { validateEmail } from "../utils/common.utils.js";
import { EmailTemplateType } from "../constants/types.js";
import fs from "fs";


class BrevoService {
    private brevoClient: BrevoClient;
    private static instance: BrevoService;
    private templateCache: Map<string, string>;

    private constructor() {
        this.brevoClient = new BrevoClient({
            apiKey: appConfig.brevo_api_key,
        });
        // To improve performance. 
        this.templateCache = new Map<string, string>();
    }

    public static getInstance(): BrevoService {
        if (!BrevoService.instance) {
            BrevoService.instance = new BrevoService();
        }
        return BrevoService.instance;
    }


    private loadTemplate(key: string): string {
        if (!this.templateCache.has(key)) {
            const path = templateMap[key as keyof typeof templateMap];
            if (!path) {
                throw new Error(`Template not found for key: ${key}`);
            }
            this.templateCache.set(key, fs.readFileSync(path, "utf-8"));
        }
        return this.templateCache.get(key)!;
    }

    /**
     * Replaces {{ params.key }} placeholders in a template string with values from a params map.
     * Brevo only renders params for stored templateId emails — NOT for raw htmlContent.
     * We must substitute locally before sending.
     */

    private escapeHtml(str: string = ""): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    private interpolateTemplate(html: string, params: Record<string, string | undefined>): string {
        return html.replace(/{{\s*params\.(\w+)\s*}}/g, (_, key) => {
            const value = params[key] ?? "";
            return this.escapeHtml(value);
        });
    }

    public async sendEmail(
        toEmail: string,
        toName: string,
        emailType: EmailTemplateType,
        otp?: string,
        userAgent?: string,
        ipAddress?: string,
        customParams?: Record<string, string | undefined>
    ) {
        try {
            if (!validateEmail(toEmail) || !toName || toName.trim() === "" || toEmail.trim() === "") {
                throw new Error(`Invalid email or name provided`);
            }

            const rawHtml = this.loadTemplate(emailType);
            const currentTime = new Date().toLocaleString();
            const validityMinutes = Math.max(1, Math.round(appConfig.time_window / 60));
            const params: Record<string, string | undefined> = {
                name: toName,
                otp: otp,
                validity_minutes: `${validityMinutes} minutes`,
                signup_time: currentTime,
                signin_time: currentTime,
                request_time: currentTime,
                device_info: userAgent || "unknown device",
                ip_address: ipAddress || "unknown",
                ...(customParams || {}),
            };
            const htmlContent = this.interpolateTemplate(rawHtml, params);

            let subject = "Edu Platform Notification";
            if (emailType === EmailTemplateType.SIGNUP_OTP) {
                subject = "Welcome to Edu Platform - Email Verification";
            } else if (emailType === EmailTemplateType.SIGNIN_OTP) {
                subject = "Edu Platform - Sign-in Verification Code";
            } else if (emailType === EmailTemplateType.EXAM_REMINDER) {
                subject = `Exam Starting Soon: ${customParams?.exam_title || "Upcoming Exam"}`;
            } else if (emailType === EmailTemplateType.EXAM_FAILURE) {
                subject = `Exam Notice: Delay or Technical Issue - ${customParams?.exam_title || "Scheduled Exam"}`;
            }

            await this.brevoClient.transactionalEmails.sendTransacEmail({
                htmlContent,
                sender: {
                    email: appConfig.brevo_sender_email,
                    name: appConfig.brevo_sender_name
                },
                to: [{ email: toEmail, name: toName }],
                subject
            });
        } catch (error: any) {
            console.error(`[BrevoService] Failed to send ${emailType} email to ${toEmail}:`, error.message);
            throw new Error("Failed to send transactional email notification.");
        }
    }
}


const brevoService = BrevoService.getInstance();
export default brevoService;