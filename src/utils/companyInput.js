import { MAX_PASSWORD_BYTES } from "./password.js";
import { normalizeEmail } from "./validation.js";
import { parsePriceCents } from "./money.js";

// What it takes to make a company (ADR 0018). The rules match the ones the database and the admin pages already apply,
// so a company made here is one the rest of the app accepts: the slug is the same pattern as the companies.slug check,
// the owner's email and password follow registration, and a service follows the Manage Services page.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_NAME = 100;
export const MAX_SLUG = 40;
export const MAX_SERVICE_NAME = 80;

// "Aeration" or "Aeration=75.00". No price means 0, which the owner can change on Manage Services.
function parseService(text) {
    const at = text.lastIndexOf("=");
    const name = (at === -1 ? text : text.slice(0, at)).trim();
    const price = at === -1 ? "0" : text.slice(at + 1).trim();
    const priceCents = parsePriceCents(price);

    if (!name || name.length > MAX_SERVICE_NAME) {
        return { error: `A service name must be 1 to ${MAX_SERVICE_NAME} characters: "${text}".` };
    }

    if (priceCents === null) {
        return { error: `The price of "${name}" must look like 45 or 45.50, up to 99999.99.` };
    }

    return { name, priceCents };
}

// input: { name, slug, ownerEmail, password, services: string[] }. Returns { values, errors }. values is only meant
// to be used when errors is empty. The password is checked here and never copied into the result.
export function validateCompanyInput(input) {
    const errors = [];
    const name = String(input.name ?? "").trim();
    const slug = String(input.slug ?? "").trim();
    const ownerEmail = normalizeEmail(input.ownerEmail);
    const password = String(input.password ?? "");
    const services = [];

    if (!name || name.length > MAX_NAME) {
        errors.push(`The company name must be 1 to ${MAX_NAME} characters.`);
    }

    if (!SLUG_PATTERN.test(slug) || slug.length > MAX_SLUG) {
        errors.push(`The slug must be lower-case words joined by hyphens, at most ${MAX_SLUG} characters, like acme-lawn.`);
    }

    if (!EMAIL_PATTERN.test(ownerEmail) || ownerEmail.length > 254) {
        errors.push("Enter a valid owner email address.");
    }

    if (password.length < 8) {
        errors.push("The owner password (OWNER_PASSWORD) must be at least 8 characters.");
    }

    if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
        errors.push(`The owner password must be at most ${MAX_PASSWORD_BYTES} bytes.`);
    }

    const seen = new Set();

    for (const text of input.services ?? []) {
        const parsed = parseService(String(text));

        if (parsed.error) {
            errors.push(parsed.error);
        } else if (seen.has(parsed.name.toLowerCase())) {
            errors.push(`The service "${parsed.name}" is listed twice.`);
        } else {
            seen.add(parsed.name.toLowerCase());
            services.push(parsed);
        }
    }

    return { values: { name, slug, ownerEmail, services }, errors };
}
