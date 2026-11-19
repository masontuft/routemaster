import { Router } from "express";
import companyFromSlug from "../middleware/companyFromSlug.js";
import scheduleRoutes from "./schedule.js";
import contactRoutes from "./contact.js";
import { showCompanyHome, showServices } from "../controllers/home.js";
import { listPublic } from "../controllers/reviews.js";
import { showLogin, showRegister, register } from "../controllers/auth.js";

// A company's public pages (ADR 0018), mounted at /w/:slug. They are the same pages as the bare ones, which belong
// to the first company, with the company that the slug names. Logging in is the same for everyone and stays at
// /login: the form is here only so the "create an account" link on it leads to this company's /register.
export default function companyRoutes(limit) {
    const router = Router({ mergeParams: true });

    router.use(companyFromSlug);
    router.get("/", showCompanyHome);
    router.get("/services", showServices);
    router.get("/reviews", listPublic);
    router.get("/login", showLogin);
    router.get("/register", showRegister);
    router.post("/register", register);
    router.use(scheduleRoutes(limit));
    router.use(contactRoutes(limit));

    return router;
}
