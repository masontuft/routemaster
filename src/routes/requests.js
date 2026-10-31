import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import ensureCustomer from "../middleware/ensureCustomer.js";
import * as requests from "../controllers/requests.js";
import * as properties from "../controllers/properties.js";

const router = Router();

router.use(["/requests", "/properties"], requireRole("customer"), ensureCustomer);

router.get("/requests", requests.list);
router.get("/requests/new", requests.showNew);
router.post("/requests", requests.create);
router.get("/requests/:id", requests.show);
router.get("/requests/:id/edit", requests.showEdit);
router.post("/requests/:id/edit", requests.update);
router.post("/requests/:id/cancel", requests.cancel);
router.get("/properties/new", properties.showNew);
router.post("/properties", properties.create);

export default router;
