import { SETTINGS, isKnownSetting, isAllowedValue } from "../utils/settings.js";

// The saved value, or the default when nothing is saved, or when the saved text is no longer allowed.
export async function get(pool, key) {
    if (!isKnownSetting(key)) {
        throw new RangeError(`Unknown setting: ${key}`);
    }

    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = $1", [key]);
    const saved = rows[0]?.value;
    return isAllowedValue(key, saved) ? saved : SETTINGS[key].default;
}

// Returns false, and saves nothing, for an unknown key or a value that key does not allow.
export async function set(pool, key, value, userId) {
    if (!isAllowedValue(key, value)) {
        return false;
    }

    await pool.query(
        `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
        [key, value, userId ?? null],
    );
    return true;
}

// Whether staff may book customers who have not confirmed a day. Off unless the owner turned it on.
export async function allowsTentativeBooking(pool) {
    return (await get(pool, "allow_tentative_booking")) === "on";
}
