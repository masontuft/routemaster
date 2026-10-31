import { Router } from "express";
import { listPublic } from "../controllers/reviews.js";

const router = Router();

router.get("/reviews", listPublic);

export default router;
