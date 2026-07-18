import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { applicationConfig } from "./src/config/index.js";
import routes from "./src/routes/index.js";
import { errorHandler } from "./src/middlewares/error.middleware.js";
import { connectAllDb, verifyAndSetupEnv } from "./src/utils/startup.utils.js";

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
    res.json({ message: "edu-ex Backend API is running successfully" });
});

app.use("/api", routes);

app.use(errorHandler);

async function applicationStartUp() {
    try {
        await verifyAndSetupEnv();
        console.log("Setuping environment variables done.");

        await connectAllDb();
        console.log("Connect to database");

        await new Promise<void>((resolve, reject) => {
            const server = app.listen(applicationConfig.app.port, () => {
                console.log(`Server started on port ${applicationConfig.app.port} at ${new Date().toLocaleString()}`);
                resolve();
            });
            server.on("error", (err) => {
                reject(err);
            });
        });

    } catch (error: any) {
        console.log(`Application crashed due to ${error.message || error}`);
        process.exit(1);
    }
}

applicationStartUp().catch((err: any) => {
    console.error(`Failed in setup ${err.message || err}`);
    process.exitCode = 1;
});

