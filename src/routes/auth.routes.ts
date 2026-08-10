import { Router } from "express";
import { registerUser, loginUser, logoutUser, refreshTokenHandler, verifyOTP } from "../controllers/auth.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", registerUser);
router.post("/verify", verifyOTP);
router.post("/login", loginUser);
router.post("/refresh", refreshTokenHandler);
router.post("/logout", authenticateToken, logoutUser);

export default router;
