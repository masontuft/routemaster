// Caps for the fetch and parse spike. The import screens can reuse these.
// A 17-tab job sheet fits under them; a hostile file is rejected before it is returned.
export const SPREADSHEET_LIMITS = {
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 15000,
    maxRedirects: 2,
    maxSheets: 40,
    maxRows: 20000,
    maxColumns: 64,
};
