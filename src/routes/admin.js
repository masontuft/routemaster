import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as admin from "../controllers/admin.js";
import * as clear from "../controllers/clear.js";
import * as settings from "../controllers/settings.js";

const router = Router();

router.use("/admin", requireRole("owner"));

router.get("/admin/users", admin.listUsers);
router.get("/admin/users/new", admin.showNewUser);
router.post("/admin/users", admin.createUser);
router.post("/admin/users/:id/role", admin.changeRole);
router.get("/admin/service-types", admin.listServiceTypes);
router.get("/admin/service-types/new", admin.showNewServiceType);
router.post("/admin/service-types", admin.createServiceType);
router.get("/admin/service-types/:id/edit", admin.showEditServiceType);
router.post("/admin/service-types/:id", admin.updateServiceType);
router.get("/admin/settings", settings.show);
router.post("/admin/settings", settings.update);
router.get("/admin/clear", clear.showClear);
router.get("/admin/clear/batches/:id", clear.showClearBatch);
router.post("/admin/clear/batches/:id", clear.clearBatch);
router.get("/admin/clear/all", clear.showClearAll);
router.post("/admin/clear/all", clear.clearAll);

export default router;
