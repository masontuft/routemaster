import { Router } from "express";
import { showRegister, register, showLogin, login, logout } from "../controllers/auth.js";

export default function authRoutes(limit, passwordReset) {
    const router = Router();

    router.get("/register", showRegister);
    router.post("/register", register);
    router.get("/login", showLogin);
    router.post("/login", limit, login);
    router.get("/forgot-password", passwordReset.showRequest);
    router.post("/forgot-password", limit, passwordReset.request);
    router.get("/reset-password/:token", limit, passwordReset.showReset);
    router.post("/reset-password/:token", limit, passwordReset.reset);
    router.post("/logout", logout);

    return router;
}
