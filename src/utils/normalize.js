const STREET_WORDS = {
    street: "st", avenue: "ave", road: "rd", drive: "dr", lane: "ln",
    court: "ct", boulevard: "blvd", circle: "cir", place: "pl",
};

function squash(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeName(value) {
    return squash(value);
}

export function normalizeAddress(value) {
    return squash(value).split(" ").map((word) => {
        return STREET_WORDS[word] ?? word;
    }).join(" ");
}

export function normalizePhone(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}
