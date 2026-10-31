// Prices are typed in dollars and stored as integer cents. Up to 5 digits of dollars and 2 of cents.
const PRICE_PATTERN = /^\d{1,5}(\.\d{1,2})?$/;

export function parsePriceCents(value) {
    const text = String(value ?? "").trim().replace(/^\$/, "");

    if (!PRICE_PATTERN.test(text)) {
        return null;
    }

    const [dollars, cents = ""] = text.split(".");
    return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

export function formatCents(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}
