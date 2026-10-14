import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { applicationConfig } from "./src/config/index.js";
import routes from "./src/routes/index.js";
import { errorHandler } from "./src/middlewares/error.middleware.js";
import {
    connectAllDb,
    verifyAndSetupEnv,
    connectRedis,
    closeRedisConnection,
    closeAllDb,
    startAllQueues,
    startAllWorkers,
    closeAllQueuesAndWorkers,
} from "./src/utils/startup.utils.js";
import cors from "cors";

import http from "http";
import { initExamSocketGateway } from "./src/websocket/exam.gateway.js";

const app = express();
const httpServer = http.createServer(app);

app.use(cors({
    origin: applicationConfig.app.clientUrl || "http://localhost:5001",
    credentials: true,
}));
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.use("/api", routes);

app.get("/", (req, res) => {
    res.json({ message: "edu-ex Backend API is running successfully" });
});

app.use(errorHandler);

async function applicationStartUp() {
    try {
        await verifyAndSetupEnv();
        console.log("Setuping environment variables done.");

        await connectAllDb();
        await connectRedis();
        console.log("Connected to database and Redis");

        // Start all queues and background workers
        await startAllQueues();
        await startAllWorkers();

        // Initialize Socket.IO gateway
        await initExamSocketGateway(httpServer);
        console.log("Initialized Exam Socket.IO Gateway");

        await new Promise<void>((resolve, reject) => {
            httpServer.listen(applicationConfig.app.port, () => {
                console.log(`Server started on port ${applicationConfig.app.port} at ${new Date().toLocaleString()}`);
                resolve();
            });
            httpServer.on("error", (err) => {
                reject(err);
            });
        });

    } catch (error: any) {
        console.log(`Application crashed due to ${error.message || error}`);
        await closeAllQueuesAndWorkers();
        await closeRedisConnection();
        await closeAllDb();
        process.exit(1);
    }
}

applicationStartUp().catch(async (err: any) => {
    console.error(`Failed in setup ${err.message || err}`);
    await closeAllQueuesAndWorkers();
    await closeRedisConnection();
    await closeAllDb();
    process.exitCode = 1;
});


