import ms, { type StringValue } from "ms";

export const getInMilliSec = (timePeriod: StringValue): number => {
    if (!timePeriod) {
        return 0;
    }
    const result = ms(timePeriod as StringValue);
    return typeof result === "number" ? result : NaN;
};
