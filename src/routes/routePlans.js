import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as routePlans from "../controllers/routePlans.js";

// limit is the shared per-IP limiter from app.js. Both posts call outside map services, so both are limited.
export default function routePlanRoutes(limit) {
    const router = Router();

    router.use("/staff/routes", requireRole("owner", "dispatcher"));
    router.get("/staff/routes", routePlans.show);
    router.post("/staff/routes/locate", limit, routePlans.locate);
    router.post("/staff/routes/build", limit, routePlans.build);

    return router;
}
