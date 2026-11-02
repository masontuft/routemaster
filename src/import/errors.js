export class SpreadsheetImportError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "SpreadsheetImportError";
        this.code = code;
    }
}
