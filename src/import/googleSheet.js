// Downloads a public Google Sheet as .xlsx.
// The pasted link is used only to read a sheet id. This module builds the request URL.

import { SpreadsheetImportError } from "./errors.js";
import { SPREADSHEET_LIMITS } from "./limits.js";

const GOOGLE_SHEETS_HOST = "docs.google.com";
const ACCOUNTS_HOST = "accounts.google.com";
const MAX_LINK_LENGTH = 2048;
const MAX_REDIRECT_LENGTH = 4096;
const XLSX_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// Drive ids in the wild are 33 or 44 characters. Keep a tight band around that.
const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{33,64}$/;
const SHEET_PATH_PATTERN = new RegExp(
    "^/spreadsheets(?:/u/[0-9]{1,3})?/d/([A-Za-z0-9_-]{33,64})"
    + "(?:/(?:edit|view|htmlview|preview|export|copy|pubhtml))?/?$",
);
const DOWNLOAD_HOST_PATTERN = /^[a-z0-9-]+\.googleusercontent.com$/;

const INVALID_LINK_MESSAGE = "Paste a Google Sheets link.";
const NOT_PUBLIC_MESSAGE = "That Google Sheet is not public, or the link is wrong.";
const TOO_LARGE_MESSAGE = "That spreadsheet is larger than the size limit.";
const TIMEOUT_MESSAGE = "The spreadsheet download timed out.";
const NETWORK_MESSAGE = "The spreadsheet could not be downloaded.";
const DOWNLOAD_FAILED_MESSAGE = "The spreadsheet could not be downloaded.";
const REDIRECT_MESSAGE = "The spreadsheet download was refused because it left Google's export path.";
const TOO_MANY_REDIRECTS_MESSAGE = "The spreadsheet download was refused because it redirected too many times.";
const INVALID_WORKBOOK_MESSAGE = "That file is not a readable .xlsx workbook.";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function hasForbiddenLinkCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code <= 32 || value[index] === "\\") {
            return true;
        }
    }
    return false;
}

function canonicalHostname(hostname) {
    const lower = hostname.toLowerCase();
    if (lower.endsWith(".")) {
        return lower.slice(0, -1);
    }
    return lower;
}

export function extractGoogleSheetId(link) {
    if (typeof link !== "string") {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    const trimmed = link.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_LINK_LENGTH) {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    if (hasForbiddenLinkCharacter(trimmed)) {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    if (parsed.protocol !== "https:") {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    if (parsed.username !== "" || parsed.password !== "") {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    if (parsed.port !== "") {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    if (canonicalHostname(parsed.hostname) !== GOOGLE_SHEETS_HOST) {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    const match = SHEET_PATH_PATTERN.exec(parsed.pathname);
    if (match === null) {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    return match[1];
}

export function buildGoogleSheetExportUrl(sheetId) {
    if (typeof sheetId !== "string" || SHEET_ID_PATTERN.test(sheetId) === false) {
        throw new SpreadsheetImportError("invalid_link", INVALID_LINK_MESSAGE);
    }

    return `https://${GOOGLE_SHEETS_HOST}/spreadsheets/d/${sheetId}/export?format=xlsx`;
}

function requestInit(signal) {
    return {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: {
            "accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "user-agent": "Routemaster/0.0",
        },
        signal,
    };
}

function asSpreadsheetError(error, timeoutSignal) {
    if (error instanceof SpreadsheetImportError) {
        return error;
    }

    if (timeoutSignal.aborted || (error !== null && error !== undefined && error.name === "TimeoutError")) {
        return new SpreadsheetImportError("timeout", TIMEOUT_MESSAGE);
    }

    if (error !== null && error !== undefined && error.name === "AbortError") {
        return new SpreadsheetImportError("aborted", "The spreadsheet download was cancelled.");
    }

    return new SpreadsheetImportError("network", NETWORK_MESSAGE);
}

async function discardBody(response) {
    if (response.body === null || response.body === undefined) {
        return;
    }

    try {
        await response.body.cancel();
    } catch {
        // The body is unused. A failure while discarding it does not change the decision.
    }
}

function declaredLength(response) {
    const header = response.headers.get("content-length");
    if (header === null || header === "") {
        return null;
    }

    if (!/^[0-9]+$/.test(header)) {
        throw new SpreadsheetImportError("too_large", TOO_LARGE_MESSAGE);
    }

    const size = Number(header);
    if (!Number.isSafeInteger(size)) {
        throw new SpreadsheetImportError("too_large", TOO_LARGE_MESSAGE);
    }

    return size;
}

async function readLimitedBody(response, maxBytes) {
    const declared = declaredLength(response);
    if (declared !== null && declared > maxBytes) {
        await discardBody(response);
        throw new SpreadsheetImportError("too_large", TOO_LARGE_MESSAGE);
    }

    if (response.body === null || response.body === undefined) {
        throw new SpreadsheetImportError("download_failed", DOWNLOAD_FAILED_MESSAGE);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    try {
        while (true) {
            const step = await reader.read();
            if (step.done) {
                break;
            }

            if (step.value === undefined) {
                continue;
            }

            const piece = Buffer.from(step.value);
            received += piece.length;
            if (received > maxBytes) {
                throw new SpreadsheetImportError("too_large", TOO_LARGE_MESSAGE);
            }

            chunks.push(piece);
        }
    } catch (error) {
        try {
            await reader.cancel();
        } catch {
            // The download is already being rejected.
        }
        throw error;
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // cancel() may already have released the lock.
        }
    }

    return Buffer.concat(chunks, received);
}

function hasXlsxSignature(bytes) {
    if (bytes.length < XLSX_SIGNATURE.length) {
        return false;
    }

    return bytes.subarray(0, XLSX_SIGNATURE.length).equals(XLSX_SIGNATURE);
}

function looksLikeHtml(bytes, contentType) {
    if (contentType.toLowerCase().includes("text/html")) {
        return true;
    }

    const start = bytes.subarray(0, 32).toString("utf8").trim().toLowerCase();
    if (start.startsWith("<!doctype html") || start.startsWith("<html")) {
        return true;
    }

    return false;
}

function isAllowedDownloadUrl(parsed, sheetId) {
    if (parsed.protocol !== "https:") {
        return false;
    }

    if (parsed.username !== "" || parsed.password !== "") {
        return false;
    }

    if (parsed.port !== "") {
        return false;
    }

    const formats = parsed.searchParams.getAll("format");
    if (formats.length !== 1 || formats[0] !== "xlsx") {
        return false;
    }

    const host = canonicalHostname(parsed.hostname);
    if (host === GOOGLE_SHEETS_HOST) {
        return parsed.pathname === `/spreadsheets/d/${sheetId}/export`;
    }

    if (DOWNLOAD_HOST_PATTERN.test(host) === false) {
        return false;
    }

    if (parsed.pathname.startsWith("/export/") === false) {
        return false;
    }

    const segments = parsed.pathname.split("/");
    return segments.includes(sheetId);
}

function nextRedirectUrl(response, currentUrl, sheetId) {
    const location = response.headers.get("location");
    if (location === null || location.trim() === "" || location.length > MAX_REDIRECT_LENGTH) {
        throw new SpreadsheetImportError("redirect_blocked", REDIRECT_MESSAGE);
    }

    let parsed;
    try {
        parsed = new URL(location, currentUrl);
    } catch {
        throw new SpreadsheetImportError("redirect_blocked", REDIRECT_MESSAGE);
    }

    if (canonicalHostname(parsed.hostname) === ACCOUNTS_HOST) {
        throw new SpreadsheetImportError("not_public", NOT_PUBLIC_MESSAGE);
    }

    if (isAllowedDownloadUrl(parsed, sheetId) === false) {
        throw new SpreadsheetImportError("redirect_blocked", REDIRECT_MESSAGE);
    }

    return parsed.href;
}

async function downloadWorkbook(args) {
    let currentUrl = args.exportUrl;
    let redirects = 0;
    const seen = new Set();
    seen.add(currentUrl);

    while (true) {
        const response = await args.fetchImpl(currentUrl, requestInit(args.signal));

        if (REDIRECT_STATUSES.has(response.status)) {
            if (redirects >= args.maxRedirects) {
                await discardBody(response);
                throw new SpreadsheetImportError("too_many_redirects", TOO_MANY_REDIRECTS_MESSAGE);
            }

            const nextUrl = nextRedirectUrl(response, currentUrl, args.sheetId);
            await discardBody(response);
            if (seen.has(nextUrl)) {
                throw new SpreadsheetImportError("redirect_blocked", REDIRECT_MESSAGE);
            }

            seen.add(nextUrl);
            redirects += 1;
            currentUrl = nextUrl;
            continue;
        }

        if (response.status === 401 || response.status === 403 || response.status === 404) {
            await discardBody(response);
            throw new SpreadsheetImportError("not_public", NOT_PUBLIC_MESSAGE);
        }

        if (response.status !== 200) {
            await discardBody(response);
            throw new SpreadsheetImportError("download_failed", DOWNLOAD_FAILED_MESSAGE);
        }

        const bytes = await readLimitedBody(response, args.maxBytes);
        const contentType = response.headers.get("content-type") ?? "";
        if (looksLikeHtml(bytes, contentType)) {
            throw new SpreadsheetImportError("not_public", NOT_PUBLIC_MESSAGE);
        }

        if (hasXlsxSignature(bytes) === false) {
            throw new SpreadsheetImportError("invalid_workbook", INVALID_WORKBOOK_MESSAGE);
        }

        return bytes;
    }
}

export async function fetchPublicGoogleSheet(link, options = {}) {
    const sheetId = extractGoogleSheetId(link);
    const exportUrl = buildGoogleSheetExportUrl(sheetId);
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const maxBytes = options.maxBytes ?? SPREADSHEET_LIMITS.maxBytes;
    const timeoutMs = options.timeoutMs ?? SPREADSHEET_LIMITS.timeoutMs;
    const maxRedirects = options.maxRedirects ?? SPREADSHEET_LIMITS.maxRedirects;
    const timeoutSignal = globalThis.AbortSignal.timeout(timeoutMs);
    let signal = timeoutSignal;
    if (options.signal !== undefined) {
        signal = globalThis.AbortSignal.any([options.signal, timeoutSignal]);
    }

    try {
        const bytes = await downloadWorkbook({
            fetchImpl,
            sheetId,
            exportUrl,
            maxBytes,
            maxRedirects,
            signal,
        });
        return {
            sheetId,
            exportUrl,
            bytes,
        };
    } catch (error) {
        throw asSpreadsheetError(error, timeoutSignal);
    }
}
