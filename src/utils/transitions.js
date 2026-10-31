export const STATUSES = ["Needs Review", "Requested", "Scheduled", "Completed", "Cancelled"];

// The only moves staff can make. Scheduled to Scheduled is a reschedule. Completed and Cancelled are final.
const NEXT = {
    "Needs Review": ["Requested", "Cancelled"],
    "Requested": ["Scheduled", "Cancelled"],
    "Scheduled": ["Scheduled", "Completed", "Cancelled"],
    "Completed": [],
    "Cancelled": [],
};

export function allowedNext(status) {
    return NEXT[status] ?? [];
}

export function canMove(from, to) {
    return allowedNext(from).includes(to);
}
