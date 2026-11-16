# ADR 0016: Person Name Rules

## Status

Proposed. Mason answered the rule questions on 2026-11-16: a joint name stays one customer, Jr and Sr stay in the match key, a flagged import row is skipped until the sheet is fixed, and the four changes the real data called for were accepted. It stays Proposed until the code is deployed and the backfill has run against the live database, and until Mason decides where the rental fact is kept (see Consequences).

## Date

2026-11-16

## Context

A customer's name does two jobs. People read it, and the app matches on it: the public `/schedule` page, the import preview and the import plan all compare a normalized name. `normalizeName` in `src/utils/normalize.js` turned every character that was not a letter, a digit or a space into a space. That broke matching in two ways: "Sam & Ruth Example" and "Sam and Ruth Example" got different keys, and "O'Brien" became "o brien", so it did not match "OBrien".

The names come from a Google Sheet that was typed by hand over several years, so some cells are not a person's name at all: a note about the property ("(rental)"), a note about a relative ("Max's son"), a homeowners' association, a phone number. Class feedback on 2026-11-13 asked for the rules to be explicit and written down, and for odd names to be flagged for a person instead of imported silently.

A read-only scan of the live customers on 2026-11-16 (aggregate counts only, no names kept) gave 992 customers: 893 clean, 82 that are one word, and 17 that need a person. With the new rules, 96 stored keys change. The one-word names, mostly a first name alone, were 83 of the 99 names the first draft of the rules flagged, which is why one word became a warning and not a block.

## Decision drivers

- Two spellings of one couple must match, and two different people must not.
- Never guess a surname or split a name into people.
- The sheet is the source until Postgres takes over (ADR 0009), so a name to fix is fixed there.
- No schema change, and no real customer data in the repository or its tests.
- Area names keep their own normalizer, because `subdivisions.name_normalized` is unique.

## Decision

A customer has two forms of a name. `name` is for people: it is stored tidied (spaces collapsed) and, on import, with a rental note taken out. `name_normalized` is the match key: lossy, one way, and never shown.

**The match key** (`normalizePersonName`, then `personKey`) in `src/utils/personName.js`:

- Lowercase, with a mark on a letter dropped ("José" is "jose").
- `&`, the word "and", and a slash between two words of two letters or more are the same word ("Kira Sample/ Milo Demo" is "kira sample and milo demo"). A slash with a one-letter side, as in "c/o" or "n/a", is not joined.
- An apostrophe or a period is removed, not turned into a space ("O'Brien" is "obrien", "Jr." is "jr").
- A hyphen, a comma or any other character is a space.
- Jr and Sr stay in the key, because a father and son often share an address.
- `personKey` first takes a rental note out ("Nina Sample (rental)" and "Nina Sample" share a key), then normalizes.

**Classifying a name** (`classifyName`) returns `ok`, `note` or `review`, the cleaned name, whether a rental note was taken out, and a list of reasons. A reason blocks or only warns:

| Reason | Meaning | Blocks |
| --- | --- | --- |
| `empty` | Nothing to match on, such as blank or only symbols | Yes |
| `digits` | Contains a number | Yes |
| `odd_characters` | A character that is not normally in a name, such as a parenthesis | Yes |
| `not_a_person` | A word from the placeholder, role, unit or status list (rental, resident, vacant, neighbor, deceased, and so on) | Yes |
| `business` | A word from the business, organization or trust list (LLC, HOA, properties, trustee, and so on) | Yes |
| `possessive` | Has `'s`, so it may be a note about a relative | Yes |
| `last_first` | A comma that is not before Jr, Sr, II, III or IV | Yes |
| `one_word` | One word only, so there may be no surname | No |

A joint name is never flagged. A rental note ("(rental)", "'s rental", "rental") is taken out of a name that has a person left, and reported, not blocked. A name that is only "rental" is not changed and is flagged.

**In the import preview**, every name goes through `classifyName`. The cleaned name is what is imported. A blocking reason sets the row to blocked, so it shows under Cannot Import with its reason and is skipped until the owner fixes the cell in the sheet and runs the import again, which is safe to repeat (ADR 0009). A non-blocking reason is a warning, and the row still imports.

**Elsewhere**, `customers.name_normalized` is written by `personKey` on create and on edit, read by `personKey` on the public form match, and compared by `personKey` in import matching and planning. `normalizeName` stays for area names.

**Backfill.** `pnpm names:renormalize` recomputes `name_normalized` for stored customers. It is a dry run unless given `--apply`, changes only that column, and locks `customers` for the run.

**The word lists** are in `personName.js`. They came from a research agent and a read-only check against the live names: about 120 candidate words matched only three customers and none wrongly. Words that are also common surnames (Ward, Park, Hill, King, Hall, Price, Co, Blank, Lot, Living) were left out on purpose.

## Alternatives considered

- **Split a joint name into two customers.** Rejected: the two share a phone and a street, the sheet does not say how to split "Sam & Ruth Example" into two records, and a guess would create customers nobody asked for.
- **Import a flagged row and mark it.** Rejected for now: a bad name would reach the database, matching and the Messenger `{name}` text before anyone fixed it. Skipping keeps the sheet and the database in step.
- **Fix a flagged name in the preview.** On the roadmap. A sheet row has no stable id and each step downloads the sheet again, so a fix needs a saved list matched to rows another way.
- **Let the customer confirm or suggest a name on their link page.** On the roadmap. It changes who may edit a name, and a link is a bearer token, so a correction would wait for staff approval.
- **Fuzzy matching and nicknames.** Rejected: "Bob" and "Robert" or a typo would merge people. Matching stays exact after the rules above, and ADR 0012's Needs Review queue still catches the rest.
- **Do the cleanup in SQL.** Rejected: the rules live once, in JavaScript, with tests. The database only stores the key.

## Consequences

- Rows the rules block are skipped on every import until the sheet is fixed. A one-word name still imports, with a warning.
- The stored key changes for some customers (96 of 992 on 2026-11-16). Until the backfill runs after the new code is deployed, the public form will not match those customers. Deploy, then run the backfill, close together.
- A rental note is taken out of the name on import and is not recorded anywhere, because properties have no type and the import writes no property notes. The fact stays in the sheet until the property type on the [roadmap](../product/roadmap.md) is built. Open: whether to keep it in property notes in the meantime.
- A name with no Latin letters or digits is `empty`, so it is flagged and skipped, where before it matched every other such name.
- Names typed on the public form or edited by staff are not checked, only keyed. Entry validation is not built.
- The import plan's hash changes for the same sheet, which is safe because the preview and the confirm run the same code.
- The word lists are a first guess. Adding a word is an edit to `personName.js` and a test.
- Utah's official business-name page could not be read, so the entity words for Utah rest on secondary guides, and the Idaho rules were read through a summary. Check both before relying on the entity list.

## References

- `src/utils/personName.js` and `src/utils/personName.test.js` hold the rules and their tests. `src/db/renormalizeNames.js` and `scripts/renormalize-customer-names.js` are the backfill.
- [ADR 0009](0009-spreadsheet-import-and-sync.md) for the import and why the sheet is the source. [ADR 0012](0012-customer-access-by-link.md) for exact matching and the Needs Review queue.
- [Roadmap](../product/roadmap.md): customer review of unusual names, fixing a flagged name in the preview, and property type.
- Not opened by the author of this ADR. A research agent read them and reported, so check them before relying on them: Idaho Code Title 30 chapter 21 section 30-21-302 (`https://legislature.idaho.gov/statutesrules/idstat/Title30/T30CH21/SECT30-21-302/`), Utah business-name guides by ZenBusiness and Swyft Filings (the official Utah page returned a 404), and surname frequencies from howmanyofme.org, which is derived from the 2010 Census.
