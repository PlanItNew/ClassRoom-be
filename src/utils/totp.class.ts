import crypto from "crypto";
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { appConfig } from "../config/app.config.js";

/**
 * Time block formula:
 *   t_window = floor(Current_Timestamp / Window_Size) * Window_Size
 * 
 * Stateless OTP mechanism:
 *   User ID/Secret (dynamic) + Server Secret Key (static) + t_window (fixed for period) => Stateless OTP
 * 
 * Latency & Edge Cases:
 *   Includes Look-back Validation to handle network/timing latency
 *   (e.g., OTP requested at 11:59:59 and submitted at 12:00:30).
 */
export class TimeWindowOTP {
    private static instance: TimeWindowOTP;
    private serverSecret: string;
    private timeWindow: number;  // Window size in seconds (e.g., 300s = 5 minutes)
    private lookBack: number;    // Number of past windows to check (e.g., 1 or 2)
    private lookForward: number; // Number of future windows to check (default 0)
    private totp: TOTP;
    private base32Plugin: ScureBase32Plugin;

    /**
     * Constructor for TimeWindowOTP. Enforces Singleton pattern when instantiated with default config parameters.
     */
    private constructor(
        secret: string = appConfig.otp_secret_key as string,
        timeWindow: number = appConfig.time_window,
        lookBack: number = appConfig.look_back ?? 1,
        lookForward: number = appConfig.look_forward ?? 0
    ) {
        if (!secret || secret.length < 32) {
            throw new Error('OTP_SECRET_KEY must be set and at least 32 characters long');
        }
        this.serverSecret = secret;
        this.timeWindow = timeWindow;
        this.lookBack = lookBack;
        this.lookForward = lookForward;

        this.base32Plugin = new ScureBase32Plugin();
        this.totp = new TOTP({
            period: this.timeWindow,
            crypto: new NobleCryptoPlugin(),
            base32: this.base32Plugin,
        });
    }

    /**
     * Retrieves the singleton instance of TimeWindowOTP.
     */
    public static getInstance(): TimeWindowOTP {
        if (!TimeWindowOTP.instance) {
            TimeWindowOTP.instance = new TimeWindowOTP();
        }
        return TimeWindowOTP.instance;
    }

    /**
     * Returns the rounded window timestamp (start of current time block) in seconds.
     * Formula: floor(timestamp / timeWindow) * timeWindow
     */
    public getTimeWindow(timestampInSeconds?: number): number {
        const ts = timestampInSeconds ?? Math.floor(Date.now() / 1000);
        return Math.floor(ts / this.timeWindow) * this.timeWindow;
    }

    /**
     * Combines user secret/ID with server secret and converts to Base32 format.
     */
    public getCombinedSecret(userSecret: string): string {
        const rawSecret = `${this.serverSecret}:${userSecret}`;
        const hash = crypto.createHash("sha256").update(rawSecret).digest();
        return this.base32Plugin.encode(hash);
    }

    /**
     * Generates a 6-digit OTP using the combined secret.
     */
    public async generateOtp(userSecret: string): Promise<string> {
        if (!userSecret) {
            throw new Error("User secret or user ID is required to generate OTP");
        }
        const combinedSecret = this.getCombinedSecret(userSecret);
        return await this.totp.generate({ secret: combinedSecret });
    }

    /**
     * Verifies the provided OTP against the configured time windows.
     */
    public async verifyOtp(userSecret: string, token: string): Promise<boolean> {
        if (!userSecret || !token || !/^\d{6}$/.test(token)) {
            return false;
        }

        const combinedSecret = this.getCombinedSecret(userSecret);

        // Calculate epoch tolerance in seconds for look-back and look-forward validation
        const pastSec = this.lookBack * this.timeWindow
        const futureSec = this.lookForward * this.timeWindow

        try {
            const result = await this.totp.verify(token, {
                secret: combinedSecret,
                epochTolerance: [pastSec, futureSec],
            });
            return result.valid;
        } catch {
            return false;
        }
    }

}

// Export singleton instance for easy import across application
export const totpUtil = TimeWindowOTP.getInstance();
export default TimeWindowOTP;