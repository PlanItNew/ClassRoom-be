import Router from "express";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { deleteUser, updateDetails } from "../controllers/user.controller.js";

const router = Router();

router.use(authenticateToken);
router.delete('/delete-user', deleteUser);
router.put('/update-personal-info', updateDetails);

export default router;
