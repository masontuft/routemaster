import { test } from "node:test";
import assert from "node:assert";
import { classifyName, extractRental, normalizePersonName, personKey, tidyName } from "./personName.js";

function codes(value) {
    return classifyName(value).reasons.map((entry) => {
        return entry.code;
    });
}

test("tidyName trims and collapses spaces but keeps the case and the characters", () => {
    assert.strictEqual(tidyName("  Sam  &   Ruth\tExample "), "Sam & Ruth Example");
    assert.strictEqual(tidyName(null), "");
    assert.strictEqual(tidyName(undefined), "");
});

test("the match key is lowercase, with single spaces", () => {
    assert.strictEqual(normalizePersonName("  SAM   Example "), "sam example");
    assert.strictEqual(normalizePersonName(null), "");
});

test("an ampersand, the word and, and a joining slash give the same key", () => {
    const expected = "sam and ruth example";
    assert.strictEqual(normalizePersonName("Sam & Ruth Example"), expected);
    assert.strictEqual(normalizePersonName("Sam and Ruth Example"), expected);
    assert.strictEqual(normalizePersonName("SAM AND RUTH EXAMPLE"), expected);
    assert.strictEqual(normalizePersonName("Sam&Ruth Example"), expected);
    assert.strictEqual(normalizePersonName("Sam Example/ Ruth Example"), "sam example and ruth example");
});

test("a slash with a one letter side is not a joint name", () => {
    assert.strictEqual(normalizePersonName("c/o Sam Example"), "c o sam example");
    assert.strictEqual(normalizePersonName("N/A"), "n a");
});

test("an apostrophe or a period is removed and a hyphen or a comma is a space", () => {
    assert.strictEqual(normalizePersonName("Pat O'Brien"), "pat obrien");
    assert.strictEqual(normalizePersonName("Pat O’Brien"), "pat obrien");
    assert.strictEqual(normalizePersonName("Pat OBrien"), "pat obrien");
    assert.strictEqual(normalizePersonName("Mary Smith-Jones"), "mary smith jones");
    assert.strictEqual(normalizePersonName("Example, Sam"), "example sam");
    assert.strictEqual(normalizePersonName("Sam Example Jr."), "sam example jr");
});

test("a mark on a letter is dropped", () => {
    assert.strictEqual(normalizePersonName("José Pérez"), "jose perez");
});

test("different people keep different keys", () => {
    assert.notStrictEqual(normalizePersonName("Sam Example"), normalizePersonName("Sam and Ruth Example"));
    assert.notStrictEqual(normalizePersonName("Pat Smith Jr"), normalizePersonName("Pat Smith Sr"));
    assert.notStrictEqual(normalizePersonName("Pat Smith"), normalizePersonName("Pat Smith Jr"));
});

test("a rental note is taken out of a name and remembered", () => {
    assert.deepStrictEqual(extractRental("Nina Sample (rental)"), { name: "Nina Sample", rental: true });
    assert.deepStrictEqual(extractRental("Max Sample's rental"), { name: "Max Sample", rental: true });
    assert.deepStrictEqual(extractRental("Mia Sample rental"), { name: "Mia Sample", rental: true });
    assert.deepStrictEqual(extractRental("Mia Sample Rentals"), { name: "Mia Sample", rental: true });
    assert.deepStrictEqual(extractRental("Sam Example"), { name: "Sam Example", rental: false });
});

test("nothing is taken out when nobody would be left", () => {
    assert.deepStrictEqual(extractRental("rental"), { name: "rental", rental: false });
    assert.deepStrictEqual(extractRental("(Rental)"), { name: "(Rental)", rental: false });
});

test("a joint name, an apostrophe, a hyphen, a suffix, a mark on a letter and a slash are all fine as they are", () => {
    for (const name of [
        "Sam & Ruth Example", "Sam and Ruth Example", "Pat O'Brien", "Mary Smith-Jones",
        "Sam Example Jr.", "Sam Example, Jr.", "José Pérez", "sam example", "Kira Sample/ Milo Demo",
        "Joan Ward", "Dana Park", "Pat D'Souza", "Pat O'Sullivan",
    ]) {
        const result = classifyName(name);
        assert.strictEqual(result.status, "ok", name);
        assert.deepStrictEqual(result.reasons, [], name);
        assert.strictEqual(result.rental, false, name);
    }
});

test("a rental note on a real person is fine, and the result carries the clean name", () => {
    const result = classifyName("Nina Sample (rental)");
    assert.strictEqual(result.status, "ok");
    assert.strictEqual(result.name, "Nina Sample");
    assert.strictEqual(result.rental, true);
    assert.deepStrictEqual(result.reasons, []);
    assert.strictEqual(classifyName("Max Sample's rental").status, "ok");
});

test("one word is a note, not a block: the row still imports", () => {
    const result = classifyName("Example");
    assert.strictEqual(result.status, "note");
    assert.deepStrictEqual(result.reasons.map((entry) => { return entry.code; }), ["one_word"]);
    assert.strictEqual(result.reasons[0].blocks, false);
    assert.strictEqual(classifyName("Smith Rental").status, "note");
});

test("a name written last name first is flagged, but a comma before a suffix is not", () => {
    assert.deepStrictEqual(codes("Example, Sam"), ["last_first"]);
    assert.deepStrictEqual(codes("Sam, Ruth, Example"), ["last_first"]);
    assert.deepStrictEqual(codes("Sam Example, Sr"), []);
    assert.strictEqual(classifyName("Example, Sam").status, "review");
});

test("a note about the property or a role is flagged", () => {
    assert.deepStrictEqual(codes("Vacant lot"), ["not_a_person"]);
    assert.deepStrictEqual(codes("rental"), ["not_a_person", "one_word"]);
    assert.deepStrictEqual(codes("Current Resident"), ["not_a_person"]);
    assert.deepStrictEqual(codes("Kay Sample neighbor"), ["not_a_person"]);
    assert.deepStrictEqual(codes("Unit 4"), ["digits", "not_a_person"]);
    assert.strictEqual(classifyName("Kay Sample neighbor").status, "review");
});

test("a business, an organization or a trust is flagged", () => {
    assert.deepStrictEqual(codes("Acme Properties LLC"), ["business"]);
    assert.deepStrictEqual(codes("Smith Family Trust"), ["business"]);
    assert.deepStrictEqual(codes("Sample Cove HOA"), ["business"]);
    assert.deepStrictEqual(codes("Dale Sample & Associates"), ["business"]);
    assert.deepStrictEqual(codes("Rex Sample/ Sample Properties"), ["business"]);
    assert.deepStrictEqual(codes("Smith L.L.C."), ["business"]);
});

test("a note about someone's relative is flagged by its 's", () => {
    assert.deepStrictEqual(codes("Max's son"), ["possessive"]);
    assert.deepStrictEqual(codes("Jules Sample's daughter"), ["possessive"]);
    assert.deepStrictEqual(codes("Eli's Aunt"), ["possessive"]);
});

test("digits, odd characters and a stray slash are flagged", () => {
    assert.deepStrictEqual(codes("Jon and Cara Sample 555-010-0199"), ["digits"]);
    assert.deepStrictEqual(codes("Kay Demo (Alias)"), ["odd_characters"]);
    assert.deepStrictEqual(codes("c/o Sam Example"), ["odd_characters"]);
    assert.deepStrictEqual(codes("N/A"), ["odd_characters"]);
});

test("a name with nothing to match on is flagged and nothing else is checked", () => {
    for (const value of [null, undefined, "", "   ", "***", "😀"]) {
        const result = classifyName(value);
        assert.deepStrictEqual(result.reasons.map((entry) => { return entry.code; }), ["empty"], String(value));
        assert.strictEqual(result.status, "review", String(value));
    }
});

test("every reason has a code, a message a person can read, and a blocks flag", () => {
    const result = classifyName("Example, Sam 4 LLC (rental)");
    assert.strictEqual(result.status, "review");
    assert.strictEqual(result.rental, true);
    assert.strictEqual(result.name, "Example, Sam 4 LLC");
    assert.ok(result.reasons.length >= 3);
    for (const entry of result.reasons) {
        assert.match(entry.code, /^[a-z_]+$/);
        assert.ok(entry.message.length > 0);
        assert.strictEqual(typeof entry.blocks, "boolean");
    }
});

test("personKey leaves the rental note out, so a person with and without it share one key", () => {
    assert.strictEqual(personKey("Nina Sample (rental)"), "nina sample");
    assert.strictEqual(personKey("Nina Sample"), personKey("Nina Sample (rental)"));
    assert.strictEqual(personKey("Max Sample's rental"), "max sample");
    assert.strictEqual(personKey("Sam & Ruth Example"), "sam and ruth example");
    assert.strictEqual(personKey("rental"), "rental");
    assert.strictEqual(personKey(null), "");
});
