import { test } from "node:test";
import assert from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// docs/process/customer-lifecycle.md describes the customer process step by step and names the pages for each step.
// This test keeps it honest in both directions: a page named in the doc must exist, and a page under one of the
// process areas must be named in the doc. When it fails, update the doc (or the route) in the same change.

const here = path.dirname(fileURLToPath(import.meta.url));
const docPath = path.join(here, "..", "docs", "process", "customer-lifecycle.md");
const routesDir = path.join(here, "routes");

// Paths that belong to the customer process. A new route that starts with one of these must be in the doc.
const PROCESS_PREFIXES = [
    "/admin/import", "/admin/clear", "/staff/areas", "/staff/link-batches", "/staff/messenger-batches", "/staff/day-board", "/staff/routes",
    "/staff/rebooking", "/admin/settings", "/l/", "/schedule", "/requests", "/properties",
];

// Reads the paths straight from the route files, so no database or app start is needed.
async function registeredPaths() {
    const paths = new Set();

    for (const file of await readdir(routesDir)) {
        const source = await readFile(path.join(routesDir, file), "utf8");

        for (const match of source.matchAll(/router\.(?:get|post)\(\s*"([^"]+)"/g)) {
            paths.add(match[1]);
        }
    }

    return paths;
}

// Every `/something` in backticks, without a query string or an ellipsis.
function pathsInDoc(text) {
    const found = new Set();

    for (const match of text.matchAll(/`(\/[^`\s]*)`/g)) {
        const cleaned = match[1].split("?")[0].replace(/…$/, "");

        if (cleaned.length > 1) {
            found.add(cleaned);
        }
    }

    return found;
}

test("every page named in the process doc is a real route", async () => {
    const doc = await readFile(docPath, "utf8");
    const registered = await registeredPaths();

    const missing = [...pathsInDoc(doc)].filter((docPath) => {
        return !registered.has(docPath);
    });

    assert.deepStrictEqual(missing, [], "These paths are in the doc but are not routes. Fix the doc or the route.");
});

test("every route in a process area is named in the process doc", async () => {
    const doc = await readFile(docPath, "utf8");
    const named = pathsInDoc(doc);
    const registered = await registeredPaths();

    const undocumented = [...registered].filter((route) => {
        return PROCESS_PREFIXES.some((prefix) => {
            return route === prefix || route.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
        }) && !named.has(route);
    });

    assert.deepStrictEqual(undocumented, [], "These routes are in a process area but not in docs/process/customer-lifecycle.md.");
});

test("the process doc says when it was last verified and how to keep it current", async () => {
    const doc = await readFile(docPath, "utf8");

    assert.match(doc, /\*\*Last verified:\*\* \d{4}-\d{2}-\d{2}/);
    assert.match(doc, /^## How to keep this current$/m);
    assert.match(doc, /^## Changes to the process$/m);
});

test("the checker itself notices a missing path and an undocumented route", () => {
    const named = pathsInDoc("Use `/staff/day-board?day=…` and `/l/:token` but not `src/app.js` or `/`.");

    assert.deepStrictEqual([...named].sort(), ["/l/:token", "/staff/day-board"]);
});
