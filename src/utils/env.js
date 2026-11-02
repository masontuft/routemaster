export function isProduction(nodeEnv = process.env.NODE_ENV) {
    return String(nodeEnv ?? "").trim().toLowerCase() === "production";
}

const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRETS = new Set(["change-me"]);

// Returns a message when the session secret is too weak to run in production, otherwise null.
export function sessionSecretProblem(secret, nodeEnv = process.env.NODE_ENV) {
    if (!isProduction(nodeEnv)) {
        return null;
    }

    if (PLACEHOLDER_SECRETS.has(secret) || String(secret ?? "").length < MIN_SECRET_LENGTH) {
        return `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters and not a placeholder in production.`;
    }

    return null;
}
