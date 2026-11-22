import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { testDb } from "./helpers/db.js";
import createApp from "../src/app.js";
import * as User from "../src/models/user.js";
import { hashPassword, verifyPassword } from "../src/utils/password.js";

const db = testDb("staff_invitation");
const pool = db.pool;
const sentEmails = [];
let app;
let server;
let failSend = false;

function listen(application) {
    return new Promise((resolve) => {
        const started = application.listen(0, () => {return resolve(started);});
    });
}

async function tokenFrom(agent, pagePath) {
    const response = await agent.get(pagePath);
    return response.text.match(/name="_csrf" value="([^"]+)"/)[1];
}

async function post(agent, pagePath, action, fields = {}) {
    const csrfToken = await tokenFrom(agent, pagePath);
    return agent.post(action).type("form").send({ _csrf: csrfToken, ...fields });
}

async function loginAs(agent, email, role) {
    await User.create(pool, { companyId: 1, email, passwordHash: await hashPassword("longenough"), roleName: role });
    await post(agent, "/login", "/login", { email, password: "longenough" });
}

before(async () => {
    await db.reset();
});

beforeEach(async () => {
    await db.reset();
    server?.close();
    app?.locals.sessionStore.close();
    sentEmails.length = 0;
    failSend = false;
    app = createApp({
        pool,
        sessionSecret: "test-session-secret",
        appBaseUrl: "https://example.test",
        inviteEmailSender: {
            configured: true,
            async send(message) {
                if (failSend) {
                    throw new Error("provider unavailable");
                }

                sentEmails.push(message);
                return { id: "email-id" };
            },
        },
    });
    server = await listen(app);
});

after(async () => {
    server?.close();
    app?.locals.sessionStore.close();
    await db.close();
});

test("an owner invites staff, the invitee sets a password once, then logs in", async () => {
    const owner = request.agent(server);
    await loginAs(owner, "owner@example.com", "owner");

    const created = await post(owner, "/admin/users/invite", "/admin/users/invite", {
        email: "new-staff@example.com", role: "dispatcher",
    });
    assert.strictEqual(created.status, 302);
    assert.strictEqual(created.headers.location, "/admin/users?invite=sent");
    assert.strictEqual(sentEmails.length, 1);
    assert.match(sentEmails[0].subject, /invited to Routemaster/);

    const user = await User.findByEmail(pool, "new-staff@example.com");
    assert.strictEqual(user.password_hash, null);
    const invitePath = new URL(sentEmails[0].html.match(/href="([^"]+)"/)[1]).pathname;
    const invitee = request.agent(server);
    const form = await invitee.get(invitePath);
    assert.strictEqual(form.status, 200);
    assert.match(form.text, /Set Password/);

    const accepted = await post(invitee, invitePath, invitePath, {
        password: "new-password", confirm: "new-password",
    });
    assert.strictEqual(accepted.status, 302);
    assert.strictEqual(accepted.headers.location, "/login?invite=accepted");
    const stored = await User.findByEmail(pool, "new-staff@example.com");
    assert.ok(await verifyPassword("new-password", stored.password_hash));
    const login = await post(invitee, "/login", "/login", {
        email: "new-staff@example.com", password: "new-password",
    });
    assert.strictEqual(login.status, 302);

    const secondUse = await invitee.get(invitePath);
    assert.strictEqual(secondUse.status, 400);
    assert.match(secondUse.text, /already used/);
});

test("only owners can invite staff, and an email failure leaves a resendable pending account", async () => {
    const dispatcher = request.agent(server);
    await loginAs(dispatcher, "dispatcher@example.com", "dispatcher");
    const denied = await post(dispatcher, "/admin/users/invite", "/admin/users/invite", {
        email: "denied@example.com", role: "dispatcher",
    });
    assert.strictEqual(denied.status, 403);

    const owner = request.agent(server);
    await loginAs(owner, "owner@example.com", "owner");
    failSend = true;
    const response = await post(owner, "/admin/users/invite", "/admin/users/invite", {
        email: "pending@example.com", role: "dispatcher",
    });
    assert.strictEqual(response.status, 502);
    assert.match(response.text, /Resend Invitation/);
    assert.strictEqual((await User.findByEmail(pool, "pending@example.com")).password_hash, null);

    failSend = false;
    const pending = await User.findByEmail(pool, "pending@example.com");
    const deniedResend = await post(dispatcher, "/admin/users", `/admin/users/${pending.id}/invite`);
    assert.strictEqual(deniedResend.status, 403);
    const resent = await post(owner, "/admin/users", `/admin/users/${pending.id}/invite`);
    assert.strictEqual(resent.status, 302);
    assert.strictEqual(resent.headers.location, "/admin/users?invite=resent");
    assert.strictEqual(sentEmails.length, 1);
});
