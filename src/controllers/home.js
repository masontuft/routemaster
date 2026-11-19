import * as ServiceType from "../models/serviceType.js";
import { publicCompanyId } from "../utils/company.js";

export function showHome(req, res) {
    res.render("home", { title: "Routemaster", pageStyle: "marketing" });
}

// The bare /services is the first company's catalog, and /w/<slug>/services is that company's (publicCompanyId).
export async function showServices(req, res) {
    const services = await ServiceType.listActive(req.app.locals.db, publicCompanyId(req));
    res.render("services", { title: "Services and Pricing", pageStyle: "marketing", services });
}

// The front page of a company at /w/<slug>: its name, its services and where to go next.
export async function showCompanyHome(req, res) {
    const services = await ServiceType.listActive(req.app.locals.db, req.company.id);
    res.render("company/home", { title: req.company.name, pageStyle: "marketing", services });
}
