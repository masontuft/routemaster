import { test } from "node:test";
import assert from "node:assert";
import {
    buildGoogleSheetExportUrl,
    extractGoogleSheetId,
    fetchPublicGoogleSheet,
} from "./googleSheet.js";
import { SpreadsheetImportError } from "./errors.js";

const SHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const EDIT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing#gid=0`;
const XLSX_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

function fakeResponse({ status = 200, headers = {}, chunks = null }) {
    const normalized = {};
    for (const [key, value] of Object.entries(headers)) {
        normalized[key.toLowerCase()] = value;
    }

    const bodyChunks = chunks === null ? [] : chunks;
    return {
        status,
        headers: {
            get(name) {
                const value = normalized[name.toLowerCase()];
                if (value === undefined) {
                    return null;
                }
                return value;
            },
        },
        body: {
            getReader() {
                let index = 0;
                return {
                    async read() {
                        if (index >= bodyChunks.length) {
                            return { done: true, value: undefined };
                        }
                        const value = bodyChunks[index];
                        index += 1;
                        return { done: false, value };
                    },
                    async cancel() {
                        index = bodyChunks.length;
                    },
                    releaseLock() {
                        return undefined;
                    },
                };
            },
            async cancel() {
                return undefined;
            },
        },
    };
}

function scriptedFetch(responses) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        const next = responses[calls.length - 1];
        if (next === undefined) {
            throw new Error("unexpected fetch");
        }
        if (typeof next === "function") {
            return next(url, options);
        }
        return next;
    };
    return { calls, fetchImpl };
}

function xlsxResponse(bytes = XLSX_BYTES) {
    return fakeResponse({
        status: 200,
        headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        chunks: [bytes],
    });
}

test("a sheets link yields a fixed export URL", () => {
    assert.strictEqual(extractGoogleSheetId(EDIT_URL), SHEET_ID);
    assert.strictEqual(buildGoogleSheetExportUrl(SHEET_ID), EXPORT_URL);
    assert.strictEqual(
        extractGoogleSheetId(`https://docs.google.com/spreadsheets/u/0/d/${SHEET_ID}/edit`),
        SHEET_ID,
    );
    assert.strictEqual(
        extractGoogleSheetId(`https://docs.google.com./spreadsheets/d/${SHEET_ID}/htmlview`),
        SHEET_ID,
    );
});

test("the pasted link cannot choose the host or the query", async () => {
    const { calls, fetchImpl } = scriptedFetch([xlsxResponse()]);
    const result = await fetchPublicGoogleSheet(
        `${EDIT_URL}&redirect=http://169.254.169.254/`,
        { fetchImpl },
    );

    assert.strictEqual(result.sheetId, SHEET_ID);
    assert.strictEqual(result.exportUrl, EXPORT_URL);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, EXPORT_URL);
    assert.strictEqual(calls[0].url.includes("169.254.169.254"), false);
    assert.strictEqual(calls[0].url.includes("usp=sharing"), false);
    assert.strictEqual(calls[0].options.redirect, "manual");
    assert.strictEqual(calls[0].options.credentials, "omit");
    assert.deepStrictEqual(result.bytes, XLSX_BYTES);
});

test("links that are not a public Google Sheet are rejected", () => {
    const rejected = [
        "",
        "not a url",
        "http://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit",
        "https://drive.google.com/file/d/" + SHEET_ID + "/view",
        "https://docs.google.com.evil.com/spreadsheets/d/" + SHEET_ID + "/edit",
        "https://evil.com@docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit",
        "https://docs.google.com@evil.com/spreadsheets/d/" + SHEET_ID + "/edit",
        "https://docs.google.com:444/spreadsheets/d/" + SHEET_ID + "/edit",
        "https://user:pass@docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit",
        "https://docs.google.com/spreadsheets/d/short/edit",
        "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/../../etc/passwd",
        "https://169.254.169.254/spreadsheets/d/" + SHEET_ID + "/edit",
        "javascript:alert(1)",
        "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit extra",
        null,
        12,
    ];

    for (const link of rejected) {
        assert.throws(() => {
            extractGoogleSheetId(link);
        }, (error) => {
            assert.ok(error instanceof SpreadsheetImportError);
            assert.strictEqual(error.code, "invalid_link");
            return true;
        });
    }

    assert.throws(() => {
        buildGoogleSheetExportUrl(`${SHEET_ID}/export?format=csv`);
    }, (error) => {
        assert.strictEqual(error.code, "invalid_link");
        return true;
    });
});

test("an allowlisted download redirect is followed once", async () => {
    const downloadUrl = `https://doc-08-4o-sheets.googleusercontent.com/export/token/${SHEET_ID}?format=xlsx`;
    const { calls, fetchImpl } = scriptedFetch([
        fakeResponse({
            status: 307,
            headers: { location: downloadUrl },
        }),
        xlsxResponse(),
    ]);

    const result = await fetchPublicGoogleSheet(EDIT_URL, { fetchImpl });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].url, EXPORT_URL);
    assert.strictEqual(calls[1].url, downloadUrl);
    assert.strictEqual(calls[1].options.redirect, "manual");
    assert.deepStrictEqual(result.bytes, XLSX_BYTES);
});

test("redirects off the export path are not fetched", async () => {
    const blocked = [
        "http://127.0.0.1/latest/meta-data",
        "https://169.254.169.254/",
        `https://docs.google.com.evil.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`,
        `https://evil.googleusercontent.com.attacker.net/export/${SHEET_ID}?format=xlsx`,
        `https://user:pass@doc-0.googleusercontent.com/export/${SHEET_ID}?format=xlsx`,
        `https://doc-0.googleusercontent.com:444/export/${SHEET_ID}?format=xlsx`,
        `https://doc-0.googleusercontent.com/export/${SHEET_ID}?format=csv`,
        `https://doc-0.googleusercontent.com/other/${SHEET_ID}?format=xlsx`,
        `https://doc-0.googleusercontent.com/export/someone-else?format=xlsx`,
        EXPORT_URL,
    ];

    for (const location of blocked) {
        const { calls, fetchImpl } = scriptedFetch([
            fakeResponse({
                status: 302,
                headers: { location },
            }),
            xlsxResponse(),
        ]);

        await assert.rejects(() => {
            return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl });
        }, (error) => {
            assert.ok(error instanceof SpreadsheetImportError);
            assert.strictEqual(error.code, "redirect_blocked");
            assert.strictEqual(error.message.includes("127.0.0.1"), false);
            assert.strictEqual(error.message.includes("169.254"), false);
            assert.strictEqual(error.message.includes("attacker"), false);
            return true;
        });
        assert.strictEqual(calls.length, 1);
    }
});

test("a redirect to the Google account page is not followed", async () => {
    const { calls, fetchImpl } = scriptedFetch([
        fakeResponse({
            status: 302,
            headers: { location: "https://accounts.google.com/ServiceLogin?continue=1" },
        }),
    ]);

    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl });
    }, (error) => {
        assert.strictEqual(error.code, "not_public");
        return true;
    });
    assert.strictEqual(calls.length, 1);
});

test("too many redirects are refused", async () => {
    const hop = (name) => {
        return fakeResponse({
            status: 307,
            headers: {
                location: `https://${name}.googleusercontent.com/export/step/${SHEET_ID}?format=xlsx`,
            },
        });
    };
    const { calls, fetchImpl } = scriptedFetch([
        hop("one"),
        hop("two"),
        hop("three"),
        xlsxResponse(),
    ]);

    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl, maxRedirects: 2 });
    }, (error) => {
        assert.strictEqual(error.code, "too_many_redirects");
        return true;
    });
    assert.strictEqual(calls.length, 3);
});

test("an oversized content-length is rejected before the body is read", async () => {
    let reads = 0;
    const response = fakeResponse({
        status: 200,
        headers: { "content-length": String(6 * 1024 * 1024) },
        chunks: [XLSX_BYTES],
    });
    const originalGetReader = response.body.getReader;
    response.body.getReader = () => {
        reads += 1;
        return originalGetReader();
    };
    const { fetchImpl } = scriptedFetch([response]);

    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl });
    }, (error) => {
        assert.strictEqual(error.code, "too_large");
        return true;
    });
    assert.strictEqual(reads, 0);
});

test("a body over the size limit is rejected", async () => {
    const { fetchImpl } = scriptedFetch([
        fakeResponse({
            status: 200,
            headers: {
                "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
            chunks: [XLSX_BYTES, Buffer.alloc(32)],
        }),
    ]);

    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl, maxBytes: 8 });
    }, (error) => {
        assert.strictEqual(error.code, "too_large");
        return true;
    });
});

test("a missing sheet and an HTML sign-in page are not public", async () => {
    const missing = scriptedFetch([
        fakeResponse({ status: 404, headers: { "content-type": "text/html" } }),
    ]);
    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl: missing.fetchImpl });
    }, (error) => {
        assert.strictEqual(error.code, "not_public");
        return true;
    });

    const html = scriptedFetch([
        fakeResponse({
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
            chunks: [Buffer.from("<html>sign in</html>")],
        }),
    ]);
    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl: html.fetchImpl });
    }, (error) => {
        assert.strictEqual(error.code, "not_public");
        return true;
    });
});

test("a hung download times out", async () => {
    const fetchImpl = async (url, options) => {
        await new Promise((resolve, reject) => {
            const signal = options.signal;
            if (signal.aborted) {
                reject(signal.reason);
                return;
            }
            signal.addEventListener("abort", () => {
                reject(signal.reason);
            }, { once: true });
        });
    };

    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl, timeoutMs: 20 });
    }, (error) => {
        assert.ok(error instanceof SpreadsheetImportError);
        assert.strictEqual(error.code, "timeout");
        return true;
    });
});

test("a network failure does not echo the request URL", async () => {
    const fetchImpl = async () => {
        throw new TypeError("connect ECONNREFUSED 10.1.2.3");
    };

    await assert.rejects(() => {
        return fetchPublicGoogleSheet(EDIT_URL, { fetchImpl });
    }, (error) => {
        assert.strictEqual(error.code, "network");
        assert.strictEqual(error.message.includes("10.1.2.3"), false);
        assert.strictEqual(error.message.includes(EXPORT_URL), false);
        return true;
    });
});
