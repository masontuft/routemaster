import { Router } from "express";
import * as schedule from "../controllers/schedule.js";

export default function scheduleRoutes(limit) {
    const router = Router();

    router.get("/schedule", schedule.showIdentify);
    router.post("/schedule", limit, schedule.identify);
    router.get("/schedule/date", schedule.showDate);
    router.post("/schedule/date", limit, schedule.submitDate);
    router.get("/schedule/thanks", schedule.thanks);

    return router;
}
