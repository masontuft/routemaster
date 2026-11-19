import { Router } from "express";
import { requireLogin } from "../middleware/auth.js";
import { showPassword, changePassword } from "../controllers/account.js";

export default function accountRoutes(limit) {
    const router = Router();

    router.use("/account", requireLogin);
    router.get("/account/password", showPassword);
    router.post("/account/password", limit, changePassword);

    return router;
}
