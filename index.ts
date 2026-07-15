import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { applicationConfig } from "./src/config/index.js";
import routes from "./src/routes/index.js";
import { errorHandler } from "./src/middlewares/error.middleware.js";

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
    res.json({ message: "edu-ex Backend API is running successfully" });
});

app.use("/api", routes);

app.use(errorHandler);

app.listen(applicationConfig.app.port, () => {
    console.log(`Server started on port ${applicationConfig.app.port}`);
});