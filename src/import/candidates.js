import { cellText } from "./columns.js";
import { normalizePhone } from "../utils/normalize.js";
import { parsePriceCents } from "../utils/money.js";

const PHONE_DIGITS = 10;
const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
];
const ISO_DATE = /^\d{4}-(\d{2})-(\d{2})(?:$|[T\s])/;
const NUMERIC_DATE = /^(\d{1,2})[/-](\d{1,2})(?:[/-](?:\d{2}|\d{4}))?$/;
const WORD_DATE = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*\d{4})?$/;

// A month is a full name, its three-letter form, or "sept". A word that merely starts like one is not a month.
function monthNumber(word) {
    const lower = word.toLowerCase();
    const index = MONTHS.findIndex((name) => {
        return lower === name || lower === name.slice(0, 3) || (lower === "sept" && name === "september");
    });
    return index + 1;
}

function pad(number) {
    return String(number).padStart(2, "0");
}

// The sheet's dates have no reliable year (a typed "10/14" gets whatever year it was typed in),
// so only the month and day are kept and the season year the owner entered is used.
// Returns "YYYY-MM-DD" or null when the text is not a date that exists in that year.
export function parseSeasonDate(text, seasonYear) {
    let month;
    let day;

    const iso = ISO_DATE.exec(text);
    const numeric = NUMERIC_DATE.exec(text);
    const words = WORD_DATE.exec(text);

    if (iso) {
        month = Number(iso[1]);
        day = Number(iso[2]);
    } else if (numeric) {
        month = Number(numeric[1]);
        day = Number(numeric[2]);
    } else if (words) {
        month = monthNumber(words[1]);
        day = Number(words[2]);
    } else {
        return null;
    }

    const daysInMonth = new Date(Date.UTC(seasonYear, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
        return null;
    }

    return `${seasonYear}-${pad(month)}-${pad(day)}`;
}

// Mixed formats are read only when they are plainly a dollar amount. Anything else is flagged, not guessed.
export function parseAmountCents(text) {
    return parsePriceCents(text.replace(/,/g, ""));
}

function candidateFor(row, mapping) {
    const text = (key) => {
        const index = mapping.columns[key];
        return index === undefined ? null : cellText(row.values[index]);
    };

    const candidate = {
        rowNumber: row.rowNumber,
        name: text("name"),
        phone: text("phone"),
        street: text("street"),
        city: text("city"),
        zip: text("zip"),
        date: null,
        amountCents: null,
        area: text("area"),
        notes: text("notes"),
        issues: [],
        blocked: false,
    };

    if (candidate.name === null) {
        candidate.issues.push("Missing customer name.");
        candidate.blocked = true;
    }

    if (candidate.street === null) {
        candidate.issues.push("Missing street address.");
        candidate.blocked = true;
    }

    if (candidate.phone !== null && normalizePhone(candidate.phone).length !== PHONE_DIGITS) {
        candidate.issues.push("Phone number is not 10 digits.");
    }

    const date = text("date");
    if (date !== null) {
        candidate.date = parseSeasonDate(date, mapping.seasonYear);
        if (candidate.date === null) {
            candidate.issues.push("Date not recognized.");
        }
    }

    const amount = text("amount");
    if (amount !== null) {
        candidate.amountCents = parseAmountCents(amount);
        if (candidate.amountCents === null) {
            candidate.issues.push("Amount not recognized.");
        }
    }

    return candidate;
}

// mapping is the validated result of parseMapping. A row with nothing in any mapped column is skipped,
// since sheets have blank spacer rows; it is counted so the preview can say how many.
export function buildCandidates(sheet, mapping) {
    const mapped = Object.values(mapping.columns);
    const candidates = [];
    let skippedEmpty = 0;

    for (const row of sheet.rows) {
        if (row.rowNumber <= mapping.headerRow) {
            continue;
        }

        const hasContent = mapped.some((index) => {
            return cellText(row.values[index]) !== null;
        });

        if (hasContent === false) {
            skippedEmpty += 1;
            continue;
        }

        candidates.push(candidateFor(row, mapping));
    }

    return { candidates, skippedEmpty };
}
