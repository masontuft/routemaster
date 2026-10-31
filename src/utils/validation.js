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
