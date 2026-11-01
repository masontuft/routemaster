import * as ServiceType from "../models/serviceType.js";

export function showHome(req, res) {
    res.render("home", { title: "Routemaster", pageStyle: "marketing" });
}

export async function showServices(req, res) {
    const services = await ServiceType.listActive(req.app.locals.db);
    res.render("services", { title: "Services and Pricing", pageStyle: "marketing", services });
}
