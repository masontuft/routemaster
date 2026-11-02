export function isProduction(nodeEnv = process.env.NODE_ENV) {
    return String(nodeEnv ?? "").trim().toLowerCase() === "production";
}

const REQUIRED_VARIABLES = ["DATABASE_URL", "SESSION_SECRET"];

// Returns the required variables that are unset or blank, in a fixed order.
export function missingEnvVariables(env = process.env) {
    return REQUIRED_VARIABLES.filter((name) => {
        return !String(env[name] ?? "").trim();
    });
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
