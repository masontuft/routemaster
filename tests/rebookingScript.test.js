import { test } from "node:test";
import assert from "node:assert";
import { setGroup, tickedMessage, wire } from "../public/js/rebooking.js";

function box(group, textable, checked = false) {
    return { checked, dataset: { group, textable: textable ? "1" : "0" } };
}

// Just enough of a form for wire(): the lists it looks up, and click and change handlers it can register.
function fakeForm(boxes, limit = 3) {
    const handlers = {};
    const status = { hidden: true, textContent: "" };
    const part = { hidden: true };
    const makeButton = (select, group) => {
        const button = { dataset: { select, group } };
        button.addEventListener = (type, handler) => {
            handlers[`${select}:${group}`] = handler;
        };
        return button;
    };
    const buttons = [makeButton("all", "a"), makeButton("none", "a"), makeButton("all", "b")];
    const form = {
        dataset: { limit: String(limit) },
        querySelector: () => {
            return status;
        },
        querySelectorAll: (selector) => {
            if (selector === 'input[name="customerIds"]') {
                return boxes;
            }

            return selector === "button[data-select]" ? buttons : [part];
        },
        addEventListener: (type, handler) => {
            handlers[type] = handler;
        },
    };
    return { form, handlers, status, part };
}

test("select ticks only customers with a textable phone, and clear unticks them all", () => {
    const boxes = [box("a", true), box("a", false), box("a", true, true)];

    setGroup(boxes, true);
    assert.deepStrictEqual(boxes.map((item) => {
        return item.checked;
    }), [true, false, true]);

    setGroup(boxes, false);
    assert.deepStrictEqual(boxes.map((item) => {
        return item.checked;
    }), [false, false, false]);
});

test("the ticked message counts, pluralizes, and warns over the limit", () => {
    assert.strictEqual(tickedMessage(1, 500), "1 customer ticked.");
    assert.strictEqual(tickedMessage(0, 500), "0 customers ticked.");
    assert.match(tickedMessage(501, 500), /501 customers ticked\. A batch holds at most 500/);
    assert.doesNotMatch(tickedMessage(500, 500), /holds at most/);
});

test("wiring shows the hidden controls, keeps the count, and each group's buttons touch only that group", () => {
    const boxes = [box("a", true), box("a", true), box("b", true), box("b", false)];
    const { form, handlers, status, part } = fakeForm(boxes);

    wire(form);
    assert.strictEqual(part.hidden, false);
    assert.strictEqual(status.hidden, false);
    assert.strictEqual(status.textContent, "0 customers ticked.");

    handlers["all:a"]();
    assert.deepStrictEqual(boxes.map((item) => {
        return item.checked;
    }), [true, true, false, false]);
    assert.strictEqual(status.textContent, "2 customers ticked.");

    handlers["all:b"]();
    assert.strictEqual(status.textContent, "3 customers ticked.");
    assert.match(tickedMessage(4, 3), /holds at most 3/);

    handlers["none:a"]();
    assert.strictEqual(status.textContent, "1 customer ticked.");

    boxes[3].checked = true;
    handlers.change();
    assert.strictEqual(status.textContent, "2 customers ticked.");
});
