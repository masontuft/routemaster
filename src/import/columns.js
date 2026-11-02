const SAMPLE_ROWS = 3;
const LETTERS = 26;

// 0 -> A, 25 -> Z, 26 -> AA, the way a spreadsheet labels columns.
export function columnLabel(index) {
    let label = "";
    let rest = index;
    while (rest >= 0) {
        label = String.fromCharCode(65 + (rest % LETTERS)) + label;
        rest = Math.floor(rest / LETTERS) - 1;
    }
    return label;
}

export function cellText(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();
    return text === "" ? null : text;
}

export function columnCount(sheet) {
    return Math.max(0, ...sheet.rows.map((row) => {
        return row.values.length;
    }));
}

// headerRow is a sheet row number, not a position in sheet.rows: blank rows are not in the list.
// Unlabeled columns get "Column C" so the owner can still pick them, and each column shows
// the first few values below the header so the owner can tell what it holds.
export function describeColumns(sheet, headerRow) {
    const header = sheet.rows.find((row) => {
        return row.rowNumber === headerRow;
    });
    const below = sheet.rows.filter((row) => {
        return row.rowNumber > headerRow;
    });

    return Array.from({ length: columnCount(sheet) }, (unused, index) => {
        const label = columnLabel(index);
        const heading = cellText(header?.values[index]);
        const samples = [];
        for (const row of below) {
            const text = cellText(row.values[index]);
            if (text !== null) {
                samples.push(text);
            }
            if (samples.length === SAMPLE_ROWS) {
                break;
            }
        }

        return { index, label, name: heading ?? `Column ${label}`, samples };
    });
}
