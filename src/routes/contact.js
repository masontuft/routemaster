import { Router } from "express";
import * as contact from "../controllers/contact.js";

export default function contactRoutes(limit) {
    const router = Router();

    router.get("/contact", contact.showForm);
    router.post("/contact", limit, contact.submit);

    return router;
}
