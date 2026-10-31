import { Router } from "express";
import { showContinue, redeem } from "../controllers/link.js";

export default function linkRoutes(limit) {
    const router = Router();

    router.get("/l/:token", showContinue);
    router.post("/l/:token", limit, redeem);

    return router;
}
