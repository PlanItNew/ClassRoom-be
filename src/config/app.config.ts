import { appKeys } from "./app.key.js";

export const appConfig = {
    port: process.env.PORT || 3000,
    applicationMode: process.env.MODE || "DEV",
    hasingAlgorithm: process.env.HASHING_ALGORITHM || "sha256",
    ...appKeys
}