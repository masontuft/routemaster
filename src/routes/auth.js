import { Router } from "express";
import { showRegister, register, showLogin, login, logout } from "../controllers/auth.js";

export default function authRoutes(limit) {
    const router = Router();

    router.get("/register", showRegister);
    router.post("/register", register);
    router.get("/login", showLogin);
    router.post("/login", limit, login);
    router.post("/logout", logout);

    return router;
}
