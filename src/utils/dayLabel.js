const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export { WEEKDAYS };

// 'YYYY-MM-DD' to "Tuesday, 2026-11-10". Read in UTC so no time zone moves the day.
export function dayLabel(day) {
    return `${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}, ${day}`;
}
