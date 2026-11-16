// Rules for the name of a person who is a customer. The rules are written down in ADR 0016.
//
// A customer has two forms of a name, and they do different jobs:
//   name             what people read. It stays as typed, with the spaces tidied and a "rental" note taken out.
//   name_normalized  a match key. It is lossy and one way, and people never read it.
//
// Area names keep using normalizeName in normalize.js. These rules are for people only.

// Words that show the cell is not a person's name: a note about the property, a role, or a status.
const NOT_A_PERSON_WORDS = new Set([
    "rental", "rentals", "vacant", "unknown", "tbd", "none", "duplex",
    "tba", "tbc", "null", "test", "placeholder",
    "resident", "residents", "occupant", "occupants", "tenant", "tenants", "renter", "renters", "lessee",
    "landlord", "homeowner", "homeowners", "owner", "owners", "manager", "office", "customer", "client",
    "neighbor", "neighbors",
    "condo", "condos", "apartment", "apartments", "apt", "triplex", "fourplex", "townhome", "townhomes",
    "unit", "units", "bldg", "building", "commercial", "residential",
    "deceased", "cancelled", "canceled", "closed", "sold", "inactive", "duplicate", "dup", "deleted",
]);

// Words that show the customer is a business, an organization, a trust or an estate.
const BUSINESS_WORDS = new Set([
    "llc", "lc", "inc", "corp", "ltd", "company", "properties", "property", "realty", "trust",
    "incorporated", "corporation", "limited", "llp", "lllp", "rllp", "lp", "pllc", "partnership", "dba",
    "partners", "associates", "holdings", "enterprises", "investment", "investments", "ventures", "capital",
    "group", "management", "mgmt", "development", "developers", "construction", "builders", "homes", "farms",
    "ranch", "dairy", "storage", "services", "solutions", "industries", "international",
    "hoa", "homeowners", "association", "assoc", "ministries", "foundation", "condominium", "condominiums",
    "district", "school", "schools", "university", "college", "academy", "county", "department", "dept",
    "trusts", "trustee", "trustees", "revocable", "irrevocable", "testamentary", "heirs", "estate", "estates",
]);

// "Sam Example, Jr." has a comma that is not a sign of last name first.
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

// A slash between two words of two letters or more joins two people, like "&" ("Kira Sample/ Milo Demo").
// "c/o" and "n/a" have a one letter side, so they are not joined. Capture 1 is the letters before the slash.
const JOINT_SLASH = /(\p{L}{2})\s*\/\s*(?=\p{L}{2})/gu;

// "(rental)", "rental", "Rentals", and the 's before it ("Max Sample's rental").
const RENTAL_MARKER = /(?:['’]s)?\s*\(?\brentals?\b\)?/gi;

// Anything that is not a letter, a mark on a letter, a digit, a space, or one of: ' ’ ‘ . - & ,
// A slash is not on that list. A joining slash is turned into "and" first, so only a stray one is left to flag.
const ODD_CHARACTERS = /[^\p{L}\p{M}\p{N}\s'’‘.\-&,]/u;

// Trims the ends and turns every run of spaces into one space.
export function tidyName(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

// The match key. "&", "and" and a joining slash become the same word, so "Sam & Ruth Example" and
// "Sam and Ruth Example" match. An apostrophe or a period is removed, not turned into a space, so "O'Brien" is
// "obrien", not "o brien". A hyphen or a comma is a space. A mark on a letter is dropped, so "José" is "jose".
// Jr and Sr stay in the key, because a father and son often share an address.
export function normalizePersonName(value) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(JOINT_SLASH, "$1 and ")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/['’‘.]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Takes a "rental" note out of a name and says it was there. The note belongs to the property, not the person:
// "Nina Sample (rental)" is Nina Sample, with a rental hint. Nothing is taken out when nobody is left,
// so "rental" on its own stays as it is and is flagged below.
export function extractRental(value) {
    const name = tidyName(value);
    const rest = tidyName(name.replace(RENTAL_MARKER, " "));

    if (rest === name || normalizePersonName(rest) === "") {
        return { name, rental: false };
    }

    return { name: rest, rental: true };
}

// The key a customer is stored and matched under: the rental note is left out, then the name is normalized.
// "Nina Sample (rental)" and "Nina Sample" are the same person, so they get the same key.
export function personKey(value) {
    return normalizePersonName(extractRental(value).name);
}

// blocks: true means a row with this reason is skipped until a person fixes it. false means it still imports
// and is listed for review.
function reason(code, message, blocks = true) {
    return { code, message, blocks };
}

function hasWordFrom(words, set) {
    return words.some((word) => {
        return set.has(word);
    });
}

// Says whether a name can be used as it is.
//   status "ok"      nothing to look at.
//   status "note"    imports, but a person should look at it (one word only).
//   status "review"  skipped until a person fixes it.
// Also returns name (tidied, rental note removed), rental (true when a rental note was removed) and reasons.
// It never guesses at a surname. A joint name such as "Sam & Ruth Example" is fine: it is one customer.
export function classifyName(value) {
    const { name, rental } = extractRental(value);
    const key = normalizePersonName(name);

    if (key === "") {
        return {
            status: "review", name, rental, reasons: [reason("empty", "Has no letters or numbers to match on.")],
        };
    }

    const words = key.split(" ");
    const reasons = [];

    if (/\p{N}/u.test(name)) {
        reasons.push(reason("digits", "Contains a number."));
    }

    if (ODD_CHARACTERS.test(name.replace(JOINT_SLASH, "$1 and "))) {
        reasons.push(reason("odd_characters", "Contains a character that is not normally in a name."));
    }

    if (hasWordFrom(words, NOT_A_PERSON_WORDS)) {
        reasons.push(reason("not_a_person", "Looks like a note about the property, not a person."));
    }

    if (hasWordFrom(words, BUSINESS_WORDS)) {
        reasons.push(reason("business", "Looks like a business, not a person."));
    }

    if (/['’]s\b/.test(name)) {
        reasons.push(reason("possessive", "Has 's, so it may be a note about someone's relative."));
    }

    const comma = name.indexOf(",");
    if (comma !== -1 && NAME_SUFFIXES.has(normalizePersonName(name.slice(comma + 1))) === false) {
        reasons.push(reason("last_first", "Has a comma, so it may be written last name first."));
    }

    if (words.length === 1) {
        reasons.push(reason("one_word", "Is one word, so there may be no surname.", false));
    }

    const blocking = reasons.some((entry) => {
        return entry.blocks;
    });
    const status = blocking ? "review" : (reasons.length > 0 ? "note" : "ok");

    return { status, name, rental, reasons };
}
