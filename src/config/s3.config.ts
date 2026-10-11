import { s3Keys } from "./s3.key.js";

export const s3Config = {
    ...s3Keys,
    get clientConfig() {
        const config: any = {
            region: s3Keys.region,
        };
        if (s3Keys.accessKeyId && s3Keys.secretAccessKey) {
            config.credentials = {
                accessKeyId: s3Keys.accessKeyId,
                secretAccessKey: s3Keys.secretAccessKey,
            };
        }
        if (s3Keys.endpoint) {
            config.endpoint = s3Keys.endpoint;
            config.forcePathStyle = s3Keys.forcePathStyle;
        }
        return config;
    }
};
