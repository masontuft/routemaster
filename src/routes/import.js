import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as spreadsheetImport from "../controllers/import.js";

// The preview shows customer names, phones and addresses, so no page here may be cached or replayed.
function noStore(req, res, next) {
    res.set("Cache-Control", "no-store");
    next();
}

// limit is the shared per-IP limiter from app.js. Every POST downloads the sheet again, so every POST is limited.
export default function importRoutes(limit) {
    const router = Router();

    router.use("/admin/import", requireRole("owner"), noStore);
    router.get("/admin/import", spreadsheetImport.showForm);
    router.post("/admin/import", limit, spreadsheetImport.submitLink);
    router.post("/admin/import/mapping", limit, spreadsheetImport.showMapping);
    router.post("/admin/import/preview", limit, spreadsheetImport.showPreview);
    router.post("/admin/import/confirm", limit, spreadsheetImport.confirmImport);
    router.get("/admin/import/batches/:id", spreadsheetImport.showBatch);

    return router;
}
