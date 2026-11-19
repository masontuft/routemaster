import * as ServiceType from "../models/serviceType.js";
import { DEFAULT_COMPANY_ID } from "../config/company.js";

export function showHome(req, res) {
    res.render("home", { title: "Routemaster", pageStyle: "marketing" });
}

// /services has no company in its address yet, so it lists the first company's catalog (see config/company.js).
export async function showServices(req, res) {
    const services = await ServiceType.listActive(req.app.locals.db, DEFAULT_COMPANY_ID);
    res.render("services", { title: "Services and Pricing", pageStyle: "marketing", services });
}
