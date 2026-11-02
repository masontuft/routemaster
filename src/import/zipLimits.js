// Reads a zip's central directory and refuses an archive that declares too much.
// The declared sizes are the archive's own claim, so a hostile file can lie. This stops the
// honest-but-huge case and a cheap bomb; it is not a hard memory limit.

import { SpreadsheetImportError } from "./errors.js";
import { SPREADSHEET_LIMITS } from "./limits.js";

const END_SIGNATURE = 0x06054b50;
const ENTRY_SIGNATURE = 0x02014b50;
const END_RECORD_BYTES = 22;
const ENTRY_HEADER_BYTES = 46;
const MAX_COMMENT_BYTES = 0xffff;
const ZIP32_MAX = 0xffffffff;
const ZIP16_MAX = 0xffff;
const INVALID_MESSAGE = "That file is not a readable .xlsx workbook.";
const TOO_BIG_MESSAGE = "That spreadsheet expands to more than the size limit.";

function invalid() {
    return new SpreadsheetImportError("invalid_workbook", INVALID_MESSAGE);
}

// The end record is the last 22 bytes unless the archive has a trailing comment, so scan back.
function findEndRecord(bytes) {
    const lowest = Math.max(0, bytes.length - END_RECORD_BYTES - MAX_COMMENT_BYTES);
    for (let at = bytes.length - END_RECORD_BYTES; at >= lowest; at -= 1) {
        if (bytes.readUInt32LE(at) === END_SIGNATURE) {
            return at;
        }
    }

    throw invalid();
}

export function assertZipWithinLimits(bytes, options = {}) {
    const maxEntries = options.maxZipEntries ?? SPREADSHEET_LIMITS.maxZipEntries;
    const maxUncompressed = options.maxUncompressedBytes ?? SPREADSHEET_LIMITS.maxUncompressedBytes;

    if (bytes.length < END_RECORD_BYTES) {
        throw invalid();
    }

    const end = findEndRecord(bytes);
    const entryCount = bytes.readUInt16LE(end + 10);
    const directoryOffset = bytes.readUInt32LE(end + 16);

    // 0xffff and 0xffffffff mean the real value is in a zip64 record. An .xlsx under 5 MiB never needs one.
    if (entryCount === ZIP16_MAX || directoryOffset === ZIP32_MAX) {
        throw new SpreadsheetImportError("too_large", TOO_BIG_MESSAGE);
    }

    if (entryCount > maxEntries) {
        throw new SpreadsheetImportError("too_large", TOO_BIG_MESSAGE);
    }

    let at = directoryOffset;
    let total = 0;

    for (let index = 0; index < entryCount; index += 1) {
        if (at + ENTRY_HEADER_BYTES > end || bytes.readUInt32LE(at) !== ENTRY_SIGNATURE) {
            throw invalid();
        }

        const size = bytes.readUInt32LE(at + 24);
        if (size === ZIP32_MAX) {
            throw new SpreadsheetImportError("too_large", TOO_BIG_MESSAGE);
        }

        total += size;
        if (total > maxUncompressed) {
            throw new SpreadsheetImportError("too_large", TOO_BIG_MESSAGE);
        }

        const nameBytes = bytes.readUInt16LE(at + 28);
        const extraBytes = bytes.readUInt16LE(at + 30);
        const commentBytes = bytes.readUInt16LE(at + 32);
        at += ENTRY_HEADER_BYTES + nameBytes + extraBytes + commentBytes;
    }
}
