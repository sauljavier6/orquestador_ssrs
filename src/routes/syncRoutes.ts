import { Router } from "express";
import { consumirNetsuite } from "../controllers/job";

const router = Router();


router.get("/", consumirNetsuite);

export default router;
