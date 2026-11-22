import { test } from "node:test";
import assert from "node:assert";
import {
    createStaffInviteToken, STAFF_INVITE_TTL_SECONDS, verifyStaffInviteToken,
} from "../../src/utils/emailActionToken.js";

const SECRET = "test-session-secret";
const USER = { id: 41, email: "staff@example.com", password_hash: null, role: "dispatcher" };

test("a staff invitation is bound to its pending user, email and role", () => {
    const token = createStaffInviteToken(USER, SECRET, 1_800_000_000_000);

    assert.strictEqual(verifyStaffInviteToken(token, USER, SECRET, 1_800_000_000_001), true);
    assert.strictEqual(verifyStaffInviteToken(token, { ...USER, email: "changed@example.com" }, SECRET), false);
    assert.strictEqual(verifyStaffInviteToken(token, { ...USER, role: "owner" }, SECRET), false);
    assert.strictEqual(verifyStaffInviteToken(token, { ...USER, password_hash: "already-set" }, SECRET), false);
});

test("a staff invitation expires after seven days and rejects future, malformed and tampered tokens", () => {
    const issuedAt = 1_800_000_000_000;
    const token = createStaffInviteToken(USER, SECRET, issuedAt);

    assert.strictEqual(verifyStaffInviteToken(token, USER, SECRET, issuedAt + STAFF_INVITE_TTL_SECONDS * 1000), false);
    assert.strictEqual(verifyStaffInviteToken(token, USER, SECRET, issuedAt - 60_000), false);

    const [payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    claims.nonce = "bad";
    const malformed = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
    assert.strictEqual(verifyStaffInviteToken(malformed, USER, SECRET, issuedAt), false);
    assert.strictEqual(verifyStaffInviteToken(`${payload}.${signature.slice(1)}`, USER, SECRET, issuedAt), false);
});

test("a reset token cannot be used as a staff invitation", () => {
    assert.throws(() => {return createStaffInviteToken({ ...USER, password_hash: "hash" }, SECRET);}, /pending staff account/);
});
