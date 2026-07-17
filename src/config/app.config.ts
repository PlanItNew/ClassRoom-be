import { appKeys } from "./app.key.js";

export const appConfig = {
    port: process.env.PORT || 3000,
    hasingAlgorithm: process.env.HASHING_ALGORITHM || "sha256",
    environment: process.env.ENVIRONMENT || "development",
    ...appKeys
}