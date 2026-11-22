import { test } from "node:test";
import assert from "node:assert";
import { closeOthers } from "../public/js/nav.js";

// A menu is { open, contains(node) }. This one contains exactly the nodes it was given.
function menu(open, ...inside) {
    return { open, contains: (node) => {
        return inside.includes(node);
    } };
}

test("a click inside an open menu leaves that menu open", () => {
    const target = {};
    const mine = menu(true, target);

    closeOthers([mine], target);

    assert.strictEqual(mine.open, true);
});

test("a click outside closes every open menu", () => {
    const first = menu(true);
    const second = menu(true);

    closeOthers([first, second], {});

    assert.strictEqual(first.open, false);
    assert.strictEqual(second.open, false);
});

test("a click inside one menu closes the other open menu and leaves a closed one alone", () => {
    const target = {};
    const mine = menu(true, target);
    const other = menu(true);
    const closed = menu(false);

    closeOthers([mine, other, closed], target);

    assert.strictEqual(mine.open, true);
    assert.strictEqual(other.open, false);
    assert.strictEqual(closed.open, false);
});
