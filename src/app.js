import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import routes from "./routes/index.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export default function createApp() {
    const app = express();

    app.set("view engine", "ejs");
    app.set("views", path.join(here, "views"));

    app.use(express.static(path.join(here, "..", "public")));
    app.use(routes);
    app.use(notFound);
    app.use(errorHandler);

    return app;
}
