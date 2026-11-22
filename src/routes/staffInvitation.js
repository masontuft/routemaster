import { Router } from "express";

export default function staffInvitationRoutes(limit, invitation) {
    const router = Router();

    router.get("/staff-invite/:token", limit, invitation.showSetup);
    router.post("/staff-invite/:token", limit, invitation.accept);

    return router;
}
