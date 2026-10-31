import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as admin from "../controllers/admin.js";

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

export default router;
