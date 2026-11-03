import { MAX_PASSWORD_BYTES } from "./password.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}

export function validateRegistration(body) {
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const confirm = String(body.confirm ?? "");
    const errors = [];

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        errors.push("Enter a valid email address.");
    }

    if (password.length < 8) {
        errors.push("Password must be at least 8 characters.");
    }

    if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
        errors.push(`Password must be at most ${MAX_PASSWORD_BYTES} bytes.`);
    }

    if (password !== confirm) {
        errors.push("Passwords do not match.");
    }

    return { email, password, errors };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayString(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

// A real calendar date from today up to one year ahead.
export function validatePreferredDate(value, today = todayString()) {
    const date = String(value ?? "");
    const parsed = new Date(`${date}T00:00:00Z`);

    if (!DATE_PATTERN.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        return "Choose a valid date.";
    }

    if (date < today) {
        return "Choose a date that is today or later.";
    }

    if (parsed.getTime() - new Date(`${today}T00:00:00Z`).getTime() > 366 * DAY_MS) {
        return "Choose a date within the next year.";
    }

    return null;
}

export function parseId(value) {
    return /^\d{1,9}$/.test(String(value)) ? Number(value) : null;
}

export function validateProperty(body) {
    const street = String(body.street ?? "").trim();
    const city = String(body.city ?? "").trim();
    const zip = String(body.zip ?? "").trim();
    const errors = [];

    if (!street || street.length > 120) {
        errors.push("Enter a street address.");
    }

    if (!city || city.length > 80) {
        errors.push("Enter a city.");
    }

    if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
        errors.push("Enter a valid ZIP code.");
    }

    return { values: { street, city, zip, notes: String(body.notes ?? "").trim().slice(0, 500) }, errors };
}

// Edits check only the fields that were posted and that the role may change. A blank city, ZIP or note is allowed,
// because a property imported from a spreadsheet may not have them yet. Name and street can never be blank.
export function validateCustomerEdit(body, fields) {
    const values = {};
    const errors = [];

    if (fields.includes("name") && "name" in body) {
        values.name = String(body.name ?? "").trim();
        if (!values.name || values.name.length > 100) {
            errors.push("Enter a name of up to 100 characters.");
        }
    }

    if (fields.includes("phone") && "phone" in body) {
        values.phone = String(body.phone ?? "").trim();
        if (values.phone && (values.phone.length > 30 || values.phone.replace(/\D/g, "").length < 10)) {
            errors.push("Enter a phone number with at least 10 digits, or leave it blank.");
        }
    }

    if (fields.includes("email") && "email" in body) {
        values.email = normalizeEmail(body.email);
        if (values.email && (!EMAIL_PATTERN.test(values.email) || values.email.length > 254)) {
            errors.push("Enter a valid email address, or leave it blank.");
        }
    }

    return { values, errors };
}

export function validatePropertyEdit(body, fields) {
    const values = {};
    const errors = [];

    if (fields.includes("street") && "street" in body) {
        values.street = String(body.street ?? "").trim();
        if (!values.street || values.street.length > 120) {
            errors.push("Enter a street address.");
        }
    }

    if (fields.includes("city") && "city" in body) {
        values.city = String(body.city ?? "").trim();
        if (values.city.length > 80) {
            errors.push("Enter a city of up to 80 characters, or leave it blank.");
        }
    }

    if (fields.includes("zip") && "zip" in body) {
        values.zip = String(body.zip ?? "").trim();
        if (values.zip && !/^\d{5}(-\d{4})?$/.test(values.zip)) {
            errors.push("Enter a valid ZIP code, or leave it blank.");
        }
    }

    if (fields.includes("notes") && "notes" in body) {
        values.notes = String(body.notes ?? "").trim().slice(0, 500);
    }

    return { values, errors };
}

export function validateIdentity(body) {
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const address = String(body.address ?? "").trim();
    const errors = [];

    if (!name || name.length > 100) {
        errors.push("Enter your name.");
    }

    if (phone.replace(/\D/g, "").length < 10) {
        errors.push("Enter a phone number with at least 10 digits.");
    }

    if (!address || address.length > 160) {
        errors.push("Enter your street address.");
    }

    return { values: { name, phone, address }, errors };
}

export function validateReview(body) {
    const rating = Number(body.rating);
    const text = String(body.body ?? "").trim();
    const errors = [];

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push("Choose a rating from 1 to 5.");
    }

    if (text.length > 1000) {
        errors.push("Keep your review to 1000 characters.");
    }

    return { values: { rating, body: text }, errors };
}

export function validateContact(body) {
    const name = String(body.name ?? "").trim();
    const email = normalizeEmail(body.email);
    const phone = String(body.phone ?? "").trim();
    const message = String(body.message ?? "").trim();
    const errors = [];

    if (!name || name.length > 100) {
        errors.push("Enter your name.");
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        errors.push("Enter a valid email address.");
    }

    if (phone.length > 30) {
        errors.push("Phone number is too long.");
    }

    if (!message || message.length > 2000) {
        errors.push("Enter a message of up to 2000 characters.");
    }

    return { values: { name, email, phone, message }, errors };
}
