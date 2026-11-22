import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PASSWORD_RESET_TTL_SECONDS = 30 * 60;
export const STAFF_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

function tokenKey(secret, user) {
    return createHmac("sha256", secret)
        .update("routemaster-email-action\0")
        .update(String(user.password_hash))
        .update("\0")
        .update(String(user.email))
        .digest();
}

function signature(encodedPayload, secret, user) {
    return createHmac("sha256", tokenKey(secret, user)).update(encodedPayload).digest();
}

export function createPasswordResetToken(user, secret, now = Date.now()) {
    const issuedAt = Math.floor(now / 1000);
    const payload = {
        purpose: "password-reset",
        sub: String(user.id),
        email: user.email,
        iat: issuedAt,
        exp: issuedAt + PASSWORD_RESET_TTL_SECONDS,
        nonce: randomBytes(18).toString("base64url"),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const encodedSignature = signature(encodedPayload, secret, user).toString("base64url");

    return `${encodedPayload}.${encodedSignature}`;
}

// The untrusted subject is only used as a parameterized lookup key; verifyPasswordResetToken authenticates every claim.
export function readEmailActionClaims(token) {
    if (typeof token !== "string" || token.length > 2048) {
        return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));

        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

export function verifyPasswordResetToken(token, user, secret, now = Date.now()) {
    const claims = readEmailActionClaims(token);
    const parts = typeof token === "string" ? token.split(".") : [];

    if (parts.length !== 2 || !claims || !user?.password_hash || !user.email) {
        return false;
    }

    const nowSeconds = Math.floor(now / 1000);

    if (claims.purpose !== "password-reset" || claims.sub !== String(user.id) || claims.email !== user.email
        || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)
        || claims.iat > nowSeconds + 30 || claims.exp <= nowSeconds
        || claims.exp - claims.iat !== PASSWORD_RESET_TTL_SECONDS
        || typeof claims.nonce !== "string" || !/^[A-Za-z0-9_-]{20,40}$/.test(claims.nonce)) {
        return false;
    }

    let suppliedSignature;

    try {
        suppliedSignature = Buffer.from(parts[1], "base64url");
    } catch {
        return false;
    }

    const expectedSignature = signature(parts[0], secret, user);

    return suppliedSignature.length === expectedSignature.length
        && timingSafeEqual(suppliedSignature, expectedSignature);
}

function staffInviteKey(secret, user) {
    return createHmac("sha256", secret)
        .update("routemaster-staff-invite\0")
        .update(String(user.id))
        .update("\0")
        .update(String(user.email))
        .digest();
}

export function createStaffInviteToken(user, secret, now = Date.now()) {
    if (!user || user.password_hash !== null || !user.email || !["owner", "dispatcher"].includes(user.role)) {
        throw new TypeError("A pending staff account is required to create an invitation.");
    }

    const issuedAt = Math.floor(now / 1000);
    const payload = {
        purpose: "staff-invite",
        sub: String(user.id),
        email: user.email,
        role: user.role,
        iat: issuedAt,
        exp: issuedAt + STAFF_INVITE_TTL_SECONDS,
        nonce: randomBytes(18).toString("base64url"),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const encodedSignature = createHmac("sha256", staffInviteKey(secret, user))
        .update(encodedPayload)
        .digest("base64url");

    return `${encodedPayload}.${encodedSignature}`;
}

export function verifyStaffInviteToken(token, user, secret, now = Date.now()) {
    const claims = readEmailActionClaims(token);
    const parts = typeof token === "string" ? token.split(".") : [];

    if (parts.length !== 2 || !claims || !user || user.password_hash !== null || !user.email
        || !["owner", "dispatcher"].includes(user.role)) {
        return false;
    }

    const nowSeconds = Math.floor(now / 1000);

    if (claims.purpose !== "staff-invite" || claims.sub !== String(user.id) || claims.email !== user.email
        || claims.role !== user.role || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)
        || claims.iat > nowSeconds + 30 || claims.exp <= nowSeconds
        || claims.exp - claims.iat !== STAFF_INVITE_TTL_SECONDS
        || typeof claims.nonce !== "string" || !/^[A-Za-z0-9_-]{20,40}$/.test(claims.nonce)) {
        return false;
    }

    const expectedSignature = createHmac("sha256", staffInviteKey(secret, user))
        .update(parts[0])
        .digest();
    let suppliedSignature;

    try {
        suppliedSignature = Buffer.from(parts[1], "base64url");
    } catch {
        return false;
    }

    return suppliedSignature.length === expectedSignature.length
        && timingSafeEqual(suppliedSignature, expectedSignature);
}
