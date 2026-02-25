import { Router } from "express";
import { getClientDashboard } from "../../controllers/customers/homecontroller/HomeController";
import { verifyAccessToken } from "../../middlewares/authMiddleware";

const router = Router();

router.get("/", verifyAccessToken, getClientDashboard);

export default router;
