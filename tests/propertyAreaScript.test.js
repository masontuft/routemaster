import { test } from "node:test";
import assert from "node:assert";
import { showNewAreaField } from "../public/js/propertyArea.js";

test("No area/Other shows the New Area field and turns it on", () => {
    const group = { hidden: true };
    const field = { disabled: true };

    showNewAreaField({ value: "" }, group, field);

    assert.strictEqual(group.hidden, false);
    assert.strictEqual(field.disabled, false);
});

test("a listed area hides the New Area field and turns it off, so it is not posted", () => {
    const group = { hidden: false };
    const field = { disabled: false };

    showNewAreaField({ value: "7" }, group, field);

    assert.strictEqual(group.hidden, true);
    assert.strictEqual(field.disabled, true);
});
