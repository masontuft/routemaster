import { parseArgs } from "node:util";

export const USAGE = [
    "Usage: pnpm company:create --name \"Acme Lawn\" --slug acme-lawn --owner-email owner@example.com",
    "           [--service \"Aeration=75.00\"] [--service \"Fall Cleanup=120\"] [--dry-run]",
    "The owner's password is read from the OWNER_PASSWORD environment variable and is never printed.",
    "DATABASE_URL must be set. --dry-run checks the slug and email and prints what would be made, and writes nothing.",
].join("\n");

// Reads the command line of scripts/create-company.js. A flag it does not know, a flag with no value, or a stray word
// is an error, so a typo such as --slg is caught and not ignored. Returns { options, errors }.
export function parseCompanyArgs(argv) {
    try {
        const { values } = parseArgs({
            args: argv,
            allowPositionals: false,
            strict: true,
            options: {
                name: { type: "string" },
                slug: { type: "string" },
                "owner-email": { type: "string" },
                service: { type: "string", multiple: true },
                "dry-run": { type: "boolean" },
            },
        });

        return {
            options: {
                name: values.name,
                slug: values.slug,
                ownerEmail: values["owner-email"],
                services: values.service ?? [],
                dryRun: values["dry-run"] === true,
            },
            errors: [],
        };
    } catch (error) {
        return { options: null, errors: [error.message] };
    }
}
