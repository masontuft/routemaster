// The record fields a spreadsheet column can be mapped to. Name and street are required because
// matching an existing customer needs them. Status is not mapped yet (see ADR 0009).
export const IMPORT_FIELDS = [
    { key: "name", label: "Customer Name", required: true },
    { key: "phone", label: "Phone", required: false },
    { key: "street", label: "Street Address", required: true },
    { key: "city", label: "City", required: false },
    { key: "zip", label: "ZIP", required: false },
    { key: "date", label: "Service Date", required: false },
    { key: "amount", label: "Amount", required: false },
    { key: "area", label: "Area", required: false },
    { key: "notes", label: "Notes", required: false },
];
