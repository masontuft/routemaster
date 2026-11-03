import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import * as staff from "../controllers/staff.js";
import * as moderation from "../controllers/moderation.js";
import * as areas from "../controllers/areas.js";
import * as dayBoard from "../controllers/dayBoard.js";

const router = Router();

router.use("/staff", requireRole("owner", "dispatcher"));

router.get("/staff", staff.dashboard);
router.get("/staff/requests", staff.listRequests);
router.get("/staff/requests/:id", staff.showRequest);
router.post("/staff/requests/:id/status", staff.changeStatus);
router.post("/staff/requests/:id/confirm", staff.confirmTentative);
router.post("/staff/requests/:id/referrer", staff.setReferrer);
router.get("/staff/requests/:id/match", staff.showMatch);
router.post("/staff/requests/:id/match", staff.matchExisting);
router.post("/staff/requests/:id/match/new", staff.matchNew);
router.get("/staff/customers", staff.listCustomers);
router.get("/staff/customers/:id", staff.showCustomer);
router.get("/staff/customers/:id/edit", staff.showCustomerEdit);
router.post("/staff/customers/:id/edit", staff.updateCustomer);
router.get("/staff/customers/:id/delete", staff.showCustomerDelete);
router.post("/staff/customers/:id/delete", staff.deleteCustomer);
router.post("/staff/customers/:id/properties", staff.addProperty);
router.get("/staff/properties/:id/edit", staff.showPropertyEdit);
router.post("/staff/properties/:id/edit", staff.updateProperty);
router.post("/staff/customers/:id/links", staff.createLink);
router.post("/staff/customers/:id/links/:linkId/revoke", staff.revokeLink);
router.get("/staff/areas", areas.list);
router.post("/staff/areas", areas.create);
router.get("/staff/areas/:id", areas.show);
router.post("/staff/areas/:id", areas.rename);
router.post("/staff/areas/:id/days", areas.addDays);
router.post("/staff/areas/:id/days/delete", areas.removeDay);
router.get("/staff/day-board", dayBoard.show);
router.post("/staff/day-board/schedule", dayBoard.schedule);
router.post("/staff/day-board/pencil", dayBoard.pencilIn);
router.get("/staff/reviews", moderation.listReviews);
router.post("/staff/reviews/:id/hide", moderation.hideReview);
router.post("/staff/reviews/:id/restore", moderation.restoreReview);
router.post("/staff/reviews/:id/delete", requireRole("owner"), moderation.deleteReview);
router.get("/staff/messages", moderation.listMessages);
router.get("/staff/messages/:id", moderation.showMessage);
router.post("/staff/messages/:id/reply", moderation.replyMessage);

export default router;
