import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as linkBatches from "../controllers/linkBatches.js";

// limit is the shared per-IP limiter from app.js. A POST makes live links for a whole area, so it is limited.
export default function linkBatchRoutes(limit) {
    const router = Router();

    router.use("/staff/link-batches", requireRole("owner", "dispatcher"));
    router.get("/staff/link-batches/new", linkBatches.showNew);
    router.post("/staff/link-batches", limit, linkBatches.create);

    return router;
}
