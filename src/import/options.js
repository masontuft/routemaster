// The choices that apply to a whole import rather than to one column. Checked again on the server,
// because they come back from the browser. Errors are fixed sentences that never repeat the input.

// Needs Review is a queue for unmatched visitors, not a state a matched, imported job can be in.
export const IMPORT_STATUSES = ["Requested", "Scheduled", "Completed", "Cancelled"];
export const DEFAULT_STATUS = "Completed";
export const MAX_CITY_LENGTH = 100;

const ID = /^\d{1,9}$/;

// serviceTypes: the active service types, [{ id }], read by the caller.
export function parseOptions(body, serviceTypes) {
    const errors = [];

    const rawType = String(body.serviceTypeId ?? "").trim();
    const serviceType = ID.test(rawType)
        ? serviceTypes.find((type) => {
            return type.id === Number(rawType);
        })
        : undefined;
    if (serviceType === undefined) {
        errors.push("Choose a service type from the list.");
    }

    const rawStatus = String(body.statusName ?? "").trim();
    const statusName = rawStatus === "" ? DEFAULT_STATUS : rawStatus;
    if (IMPORT_STATUSES.includes(statusName) === false) {
        errors.push("Choose a status from the list.");
    }

    const defaultCity = String(body.defaultCity ?? "").trim();
    if (defaultCity.length > MAX_CITY_LENGTH) {
        errors.push(`Default city must be at most ${MAX_CITY_LENGTH} characters.`);
    }

    if (errors.length > 0) {
        return { errors };
    }

    return { errors, value: { serviceTypeId: serviceType.id, statusName, defaultCity } };
}
