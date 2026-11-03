import * as AppSetting from "../models/appSetting.js";

async function settingsPage(req, res, notice = null) {
    const allowTentative = await AppSetting.allowsTentativeBooking(req.app.locals.db);
    res.render("admin/settings", { title: "Scheduling Settings", allowTentative, notice });
}

export async function show(req, res) {
    await settingsPage(req, res);
}

// An unchecked checkbox sends nothing, so anything other than "1" means off.
export async function update(req, res) {
    const value = req.body.allowTentative === "1" ? "on" : "off";
    await AppSetting.set(req.app.locals.db, "allow_tentative_booking", value, req.session.user.id);
    await settingsPage(req, res, "Settings saved.");
}
