import { SETTINGS, isKnownSetting, isAllowedValue } from "../utils/settings.js";

// Settings belong to a company (ADR 0018): one owner's choice never changes another company's.
// The saved value, or the default when nothing is saved, or when the saved text is no longer allowed.
export async function get(pool, companyId, key) {
    if (!isKnownSetting(key)) {
        throw new RangeError(`Unknown setting: ${key}`);
    }

    const { rows } = await pool.query(
        "SELECT value FROM app_settings WHERE key = $1 AND company_id = $2",
        [key, companyId],
    );
    const saved = rows[0]?.value;
    return isAllowedValue(key, saved) ? saved : SETTINGS[key].default;
}

// Returns false, and saves nothing, for an unknown key or a value that key does not allow.
export async function set(pool, companyId, key, value, userId) {
    if (!isAllowedValue(key, value)) {
        return false;
    }

    await pool.query(
        `INSERT INTO app_settings (key, value, updated_by, company_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
        [key, value, userId ?? null, companyId],
    );
    return true;
}

// Whether staff may book customers who have not confirmed a day. Off unless the owner turned it on.
export async function allowsTentativeBooking(pool, companyId) {
    return (await get(pool, companyId, "allow_tentative_booking")) === "on";
}
