import { test } from "node:test";
import assert from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const views = path.dirname(fileURLToPath(import.meta.url));
const LOWER = new Set([
    "a", "an", "the", "and", "but", "for", "nor", "or", "so", "yet",
    "of", "to", "in", "on", "at", "by", "with", "without", "from", "into", "as", "up", "off", "over", "per",
]);

async function ejsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? ejsFiles(full) : [full];
    }));
    return nested.flat().filter((file) => {
        return file.endsWith(".ejs");
    });
}

// Modified Chicago case: first and last word capitalized, minor words lowercase, everything else capitalized.
// Colons and semicolons count as a period, so the word after one is capitalized like any other.
export function chicagoProblems(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const problems = [];

    words.forEach((word, index) => {
        const parts = word.split("-");
        const edge = index === 0 || index === words.length - 1 || /[:;]$/.test(words[index - 1] ?? "");

        parts.forEach((part) => {
            const bare = part.replace(/[^A-Za-z0-9]/g, "");

            if (!bare || /^\d/.test(bare)) {
                return;
            }

            const minor = LOWER.has(bare.toLowerCase()) && !edge && parts.length === 1;
            const capitalized = bare[0] === bare[0].toUpperCase();

            if (minor === capitalized) {
                problems.push(`"${bare}" in "${text}"`);
            }
        });
    });

    return problems;
}

test("the checker accepts correct headings and rejects wrong ones", () => {
    assert.deepStrictEqual(chicagoProblems("Tips for Writing Code without Shortcuts"), []);
    assert.deepStrictEqual(chicagoProblems("Building a Mobile-First Layout: Why Small Screens Come First"), []);
    assert.deepStrictEqual(chicagoProblems("Or Create a New Customer"), []);
    assert.strictEqual(chicagoProblems("Tips For Writing Code").length, 1);
    assert.strictEqual(chicagoProblems("page not found").length, 3);
    assert.strictEqual(chicagoProblems("Welcome to the site").length, 1);
});

test("static headings, buttons and legends in every view use modified Chicago case", async () => {
    const found = [];
    let checked = 0;

    for (const file of await ejsFiles(views)) {
        const source = await readFile(file, "utf8");
        const pattern = /<(h[1-6]|button|legend)\b[^>]*>([^<]*)<\/\1>/g;

        for (const match of source.matchAll(pattern)) {
            const text = match[2].trim();

            if (text && !text.includes("<%")) {
                checked += 1;
                found.push(...chicagoProblems(text).map((problem) => {
                    return `${path.relative(views, file)}: ${problem}`;
                }));
            }
        }
    }

    assert.ok(checked > 40, `only ${checked} headings found`);
    assert.deepStrictEqual(found, []);
});
