import { isProduction } from "./env.js";

export function makeEmailActionUrl(appBaseUrl, path, token, nodeEnv) {
    const base = new URL(appBaseUrl);

    if (!new Set(["http:", "https:"]).has(base.protocol) || base.username || base.password
        || base.search || base.hash || base.pathname !== "/" || (isProduction(nodeEnv) && base.protocol !== "https:")) {
        throw new Error("The app base URL is invalid for email action links.");
    }

    return new URL(`${path}/${encodeURIComponent(token)}`, base).toString();
}
