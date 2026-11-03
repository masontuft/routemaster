// A spreadsheet runs a cell that starts with one of these as a formula, so such a cell gets a leading quote mark.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
    let text = String(value ?? "");

    if (FORMULA_START.test(text)) {
        text = `'${text}`;
    }

    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
    return rows.map((row) => {
        return row.map(csvCell).join(",");
    }).join("\r\n") + "\r\n";
}
