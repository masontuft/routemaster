import { Router } from "express";
import { showHome } from "../controllers/home.js";

const router = Router();

router.get("/", showHome);
router.get("/health", (req, res) => {
    res.status(200).send("ok");
});
router.get("/__dev/boot", (req, res) => {
    if (!req.app.locals.devReload) {
        res.status(404).end();
        return;
    }

    res.status(200).type("text/plain").send(req.app.locals.devReloadBootId);
});

export default router;
