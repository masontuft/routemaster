// The options the owner can set. Each has a default, so a fresh database behaves the same as one where the owner
// never opened the settings page. Values are stored as short text.
export const SETTINGS = {
    allow_tentative_booking: {
        default: "off",
        values: ["on", "off"],
    },
};

export function isKnownSetting(key) {
    return Object.hasOwn(SETTINGS, key);
}

export function isAllowedValue(key, value) {
    return isKnownSetting(key) && SETTINGS[key].values.includes(value);
}
