export function isProduction(nodeEnv = process.env.NODE_ENV) {
    return String(nodeEnv ?? "").trim().toLowerCase() === "production";
}
