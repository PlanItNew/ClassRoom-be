import express from "express";
import { config } from "./src/config/index.js";
import routes from "./src/routes/index.js";
import { errorHandler } from "./src/middlewares/error.middleware.js";
import helmet from "helmet";

const app = express();

app.use(helmet())

app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "edu-ex Backend API is running successfully" });
});

app.use("/api", routes);

app.use(errorHandler);

app.listen(config.port, () => {
    console.log(`Server started on port ${config.port}`);
});