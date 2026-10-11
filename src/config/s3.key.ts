import * as dotenv from "dotenv";
dotenv.config();

export const s3Keys = {
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    bucketName: process.env.AWS_S3_BUCKET || "classroom-attachments",
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === "true",
    putUrlExpirySeconds: parseInt(process.env.AWS_S3_PUT_EXPIRY || "900", 10), // 15 mins
    getUrlExpirySeconds: parseInt(process.env.AWS_S3_GET_EXPIRY || "900", 10), // 15 mins
};
