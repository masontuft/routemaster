import * as Company from "../models/company.js";
import { parseCompanyArgs, USAGE } from "../utils/companyArgs.js";
import { validateCompanyInput } from "../utils/companyInput.js";
import { hashPassword } from "../utils/password.js";
import { formatCents } from "../utils/money.js";

// The work of `pnpm company:create` (scripts/create-company.js), kept apart from reading the process and opening the
// database so a test can run it on the test database. Returns { exitCode, lines } and prints nothing. The owner's
// password comes from env.OWNER_PASSWORD, is hashed here, and is never put in a line.
export async function createCompany({ argv, env, pool, hash = hashPassword, baseUrl = "http://localhost:3000" }) {
    const parsed = parseCompanyArgs(argv);

    if (parsed.errors.length > 0) {
        return { exitCode: 1, lines: [...parsed.errors, "", USAGE] };
    }

    const { options } = parsed;
    const { values, errors } = validateCompanyInput({
        name: options.name, slug: options.slug, ownerEmail: options.ownerEmail,
        password: env.OWNER_PASSWORD, services: options.services,
    });

    if (errors.length > 0) {
        return { exitCode: 1, lines: [...errors, "", USAGE] };
    }

    const taken = await Company.availability(pool, values);

    if (taken.slugTaken || taken.emailTaken) {
        return {
            exitCode: 1,
            lines: [
                ...(taken.slugTaken ? [`The slug "${values.slug}" is already used by a company.`] : []),
                ...(taken.emailTaken ? [`The email ${values.ownerEmail} already has a login.`] : []),
                "Nothing was created.",
            ],
        };
    }

    const summary = [
        `Company: ${values.name}`,
        `Address:  ${baseUrl}/w/${values.slug}`,
        `Owner:    ${values.ownerEmail} (password from OWNER_PASSWORD, not shown)`,
        ...(values.services.length > 0
            ? ["Services:", ...values.services.map((service) => {
                return `  ${service.name}  ${formatCents(service.priceCents)}`;
            })]
            : ["Services: none. The owner adds them on Manage Services."]),
    ];

    if (options.dryRun) {
        return { exitCode: 0, lines: ["Dry run. Nothing was created. It would create:", ...summary] };
    }

    const made = await Company.createWithOwner(pool, {
        ...values, ownerPasswordHash: await hash(env.OWNER_PASSWORD),
    });

    if (made.error) {
        const reason = made.error === "slug_taken"
            ? `The slug "${values.slug}" was taken while this ran.`
            : `The email ${values.ownerEmail} was taken while this ran.`;
        return { exitCode: 1, lines: [reason, "Nothing was created."] };
    }

    return {
        exitCode: 0,
        lines: [`Created company ${made.companyId}.`, ...summary, "Give the owner the password yourself. It was not printed."],
        made,
    };
}
