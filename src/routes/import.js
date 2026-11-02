import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as spreadsheetImport from "../controllers/import.js";

// limit is the shared per-IP limiter from app.js. Only the POST can reach Google.
export default function importRoutes(limit) {
    const router = Router();

    router.use("/admin/import", requireRole("owner"));
    router.get("/admin/import", spreadsheetImport.showForm);
    router.post("/admin/import", limit, spreadsheetImport.submitLink);

    return router;
}
