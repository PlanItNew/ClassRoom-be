import ms, { type StringValue } from "ms";

export const getInMilliSec = (timePeriod: StringValue) => {
    if (!timePeriod) {
        return 0;
    }
    return ms(timePeriod as StringValue);
}
