import { Router } from "express";
import { showHome } from "../controllers/home.js";

const router = Router();

router.get("/", showHome);
router.get("/health", (req, res) => {
    res.status(200).send("ok");
});

export default router;
