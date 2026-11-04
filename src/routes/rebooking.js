import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as rebooking from "../controllers/rebooking.js";

// limit is the shared per-IP limiter from app.js. The POST makes live links, so it is limited.
export default function rebookingRoutes(limit) {
    const router = Router();

    router.use("/staff/rebooking", requireRole("owner", "dispatcher"));
    router.get("/staff/rebooking", rebooking.show);
    router.post("/staff/rebooking/links", limit, rebooking.makeLinks);

    return router;
}
