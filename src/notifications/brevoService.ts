import { BrevoClient } from "@getbrevo/brevo";
import { appConfig } from "../config/app.config.js";
import { templateMap } from "../constants/constants.js";
import { validateEmail } from "../utils/common.utils.js";
import { EmailTemplateType } from "../constants/types.js";
import fs from "fs";


class BrevoService {
    private brevoClient: BrevoClient;
    private static instance: BrevoService

    private constructor() {
        this.brevoClient = new BrevoClient({
            apiKey: appConfig.brevo_api_key,
        });
    }

    public static getInstance(): BrevoService {
        if (!BrevoService.instance) {
            BrevoService.instance = new BrevoService();
        }
        return BrevoService.instance;
    }


    private loadTemplate(key: string): string {
        const path = templateMap[key as keyof typeof templateMap];
        if (!path) {
            throw new Error(`Template not found for key: ${key}`);
        }
        return fs.readFileSync(path, "utf-8");
    }

    public async sendEmail(
        toEmail: string,
        toName: string,
        emailType: EmailTemplateType,
        otp?: string,
        userAgent?: string,
        ipAddress?: string
    ) {
        try {
            if (!validateEmail(toEmail) || !toName || toName.trim() === "" || toEmail.trim() === "") {
                throw new Error(`Invalid email ${toEmail} or name ${toName}`)
            }
            const htmlContent = this.loadTemplate(emailType);

            await this.brevoClient.transactionalEmails.sendTransacEmail({
                htmlContent: String(htmlContent),
                sender: {
                    email: appConfig.brevo_sender_email,
                    name: appConfig.brevo_sender_name
                },
                to: [
                    { email: toEmail, name: toName }
                ],
                params: {
                    name: toName,
                    otp: otp,
                    time_window: appConfig.time_window,
                    login_time: new Date().toLocaleString(),
                    user_agent: userAgent || "unknown device",
                    ip_address: ipAddress || "unknown device"
                },
                subject: "OTP Verification"
            })
        }
        catch (error: any) {
            throw new Error(`Failed to send message ${error.message} details\n
            Email :- ${toEmail}\n
            IP Address :- ${ipAddress}\n
            User Agent :- ${userAgent}\n
            OTP :- ${otp}\n
            Name :- ${toName}\n`)
        }
    }
}


const brevoService = BrevoService.getInstance();
export default brevoService;