import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as staff from "../controllers/staff.js";
import * as moderation from "../controllers/moderation.js";

const router = Router();

router.use("/staff", requireRole("owner", "dispatcher"));

router.get("/staff", staff.dashboard);
router.get("/staff/requests", staff.listRequests);
router.get("/staff/requests/:id", staff.showRequest);
router.post("/staff/requests/:id/status", staff.changeStatus);
router.get("/staff/requests/:id/match", staff.showMatch);
router.post("/staff/requests/:id/match", staff.matchExisting);
router.post("/staff/requests/:id/match/new", staff.matchNew);
router.get("/staff/customers", staff.listCustomers);
router.get("/staff/customers/:id", staff.showCustomer);
router.post("/staff/customers/:id/links", staff.createLink);
router.post("/staff/customers/:id/links/:linkId/revoke", staff.revokeLink);
router.get("/staff/reviews", moderation.listReviews);
router.post("/staff/reviews/:id/hide", moderation.hideReview);
router.post("/staff/reviews/:id/restore", moderation.restoreReview);
router.post("/staff/reviews/:id/delete", requireRole("owner"), moderation.deleteReview);
router.get("/staff/messages", moderation.listMessages);
router.get("/staff/messages/:id", moderation.showMessage);
router.post("/staff/messages/:id/reply", moderation.replyMessage);

export default router;
