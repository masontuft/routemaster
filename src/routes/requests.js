import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import ensureCustomer from "../middleware/ensureCustomer.js";
import * as requests from "../controllers/requests.js";
import * as properties from "../controllers/properties.js";
import * as reviews from "../controllers/reviews.js";

const router = Router();

router.use(["/requests", "/properties"], requireRole("customer"), ensureCustomer);

router.get("/requests", requests.list);
router.get("/requests/new", requests.showNew);
router.post("/requests", requests.create);
router.get("/requests/:id", requests.show);
router.get("/requests/:id/edit", requests.showEdit);
router.post("/requests/:id/edit", requests.update);
router.post("/requests/:id/cancel", requests.cancel);
router.get("/requests/:id/review", reviews.showForm);
router.post("/requests/:id/review", reviews.save);
router.post("/requests/:id/review/delete", reviews.remove);
router.get("/properties/new", properties.showNew);
router.post("/properties", properties.create);

export default router;
