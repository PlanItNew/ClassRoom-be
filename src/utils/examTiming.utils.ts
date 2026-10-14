export interface ExamTimingInfo {
    scheduledStart: Date;
    latestStartAt: Date;
    hardEndAt: Date;
}

/**
 * Calculates server-authoritative fixed timing boundaries for an exam:
 * latestStartAt = scheduledStart + accessWindowMinutes
 * hardEndAt = latestStartAt + durationMinutes
 */
export function calculateExamTiming(exam: {
    scheduledStart: Date | string | null;
    accessWindowMinutes: number;
    durationMinutes: number;
}): ExamTimingInfo {
    const scheduledStart = exam.scheduledStart
        ? new Date(exam.scheduledStart)
        : new Date();
    const scheduledStartMs = scheduledStart.getTime();

    const latestStartAtMs =
        scheduledStartMs + (exam.accessWindowMinutes || 30) * 60 * 1000;
    const hardEndAtMs =
        latestStartAtMs + (exam.durationMinutes || 60) * 60 * 1000;

    return {
        scheduledStart,
        latestStartAt: new Date(latestStartAtMs),
        hardEndAt: new Date(hardEndAtMs),
    };
}

/**
 * Calculates student attempt expiration:
 * attemptExpiresAt = min(startedAt + durationMinutes, hardEndAt)
 */
export function calculateAttemptExpiry(
    startedAt: Date,
    durationMinutes: number,
    hardEndAt: Date
): Date {
    const naturalExpiryMs = startedAt.getTime() + durationMinutes * 60 * 1000;
    const hardEndMs = hardEndAt.getTime();
    return new Date(Math.min(naturalExpiryMs, hardEndMs));
}

/**
 * Checks if current server time is within the access window for starting a new attempt.
 */
export function isStartWindowOpen(
    scheduledStart: Date,
    latestStartAt: Date,
    now: Date = new Date()
): boolean {
    const nowMs = now.getTime();
    return nowMs >= scheduledStart.getTime() && nowMs <= latestStartAt.getTime();
}

/**
 * Returns remaining milliseconds until expiration (strictly non-negative).
 */
export function getRemainingMs(expiresAt: Date | string, now: Date = new Date()): number {
    const expiryMs = new Date(expiresAt).getTime();
    return Math.max(0, expiryMs - now.getTime());
}
