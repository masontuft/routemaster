import { test } from "node:test";
import assert from "node:assert";
import { allowSubmit, reset, wire } from "../public/js/submitOnce.js";

function fakeForm() {
    const listeners = {};
    return {
        dataset: {},
        addEventListener(name, listener) {
            listeners[name] = listener;
        },
        submit() {
            const event = { cancelled: false, preventDefault() {
                this.cancelled = true;
            } };
            listeners.submit(event);
            return event;
        },
    };
}

test("the first submit goes ahead and a second one is cancelled", () => {
    const form = fakeForm();
    const first = { preventDefault() {
        throw new Error("the first submit must not be cancelled");
    } };
    let cancelled = false;
    const second = { preventDefault() {
        cancelled = true;
    } };

    assert.strictEqual(allowSubmit(form, first), true);
    assert.strictEqual(allowSubmit(form, second), false);
    assert.strictEqual(cancelled, true);
});

test("the button is disabled after the first submit's own click, not during it, and the second submit is cancelled", () => {
    const form = fakeForm();
    const button = { disabled: false };
    const queued = [];
    wire(form, button, (work) => {
        queued.push(work);
    });

    const first = form.submit();
    assert.strictEqual(first.cancelled, false);
    assert.strictEqual(button.disabled, false, "a button disabled during its own click is left out of the post");
    queued.forEach((work) => {
        work();
    });
    assert.strictEqual(button.disabled, true);

    assert.strictEqual(form.submit().cancelled, true);
});

test("reset makes the form usable again after Back restores it", () => {
    const form = fakeForm();
    const button = { disabled: true };
    form.dataset.submitted = "1";

    reset(form, button);

    assert.strictEqual(button.disabled, false);
    assert.strictEqual(allowSubmit(form, { preventDefault() {} }), true);
});
