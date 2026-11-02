import crypto from "node:crypto";
import { isProduction } from "../utils/env.js";

const HSTS_SIX_MONTHS = "max-age=15552000";

// No inline scripts or styles, so the policy needs no 'unsafe-inline'. The only inline script is the
// development reload snippet, which carries the per-request nonce.
function policy(nonce) {
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "style-src 'self'",
        "img-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join("; ");
}

export default function securityHeaders(req, res, next) {
    const nonce = crypto.randomBytes(16).toString("base64");
    res.locals.cspNonce = nonce;

    res.set({
        "Content-Security-Policy": policy(nonce),
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "same-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cross-Origin-Opener-Policy": "same-origin",
    });

    // Only over HTTPS: Render terminates TLS in production, and local development is plain HTTP.
    if (isProduction()) {
        res.set("Strict-Transport-Security", HSTS_SIX_MONTHS);
    }

    next();
}
