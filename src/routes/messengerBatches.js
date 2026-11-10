import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as messengerBatches from "../controllers/messengerBatches.js";

// limit is the shared per-IP limiter from app.js. A POST stages a whole area's customers, so it is limited.
export default function messengerBatchRoutes(limit) {
    const router = Router();

    router.use("/staff/messenger-batches", requireRole("owner", "dispatcher"));
    router.get("/staff/messenger-batches/new", messengerBatches.showNew);
    router.get("/staff/messenger-batches", messengerBatches.index);
    router.post("/staff/messenger-batches", limit, messengerBatches.create);
    router.post("/staff/messenger-batches/from-link-batch", limit, messengerBatches.createFromLinkBatch);
    router.get("/staff/messenger-batches/:id", messengerBatches.show);

    return router;
}
