// Select-all buttons for the rebooking page. The page works without this file: the buttons start hidden and are
// shown only once it runs, so without scripts staff still tick customers one at a time.
//
// Select All ticks every customer in a group who has a phone that can be texted (the rest would get no link, and are
// listed on the result page instead). Clear unticks the whole group. A count of ticked customers is kept up to date,
// with a warning when it is over the most one batch can hold.

// A checkbox is { checked, dataset }. These take plain lists so they can be tested without a browser.
export function setGroup(boxes, select) {
    for (const box of boxes) {
        box.checked = select ? box.dataset.textable === "1" : false;
    }
}

export function tickedMessage(ticked, limit) {
    const base = `${ticked} ${ticked === 1 ? "customer" : "customers"} ticked.`;
    return ticked > limit ? `${base} A batch holds at most ${limit}, so untick some or make links in more than one go.` : base;
}

export function wire(form) {
    const limit = Number(form.dataset.limit);
    const status = form.querySelector("[data-ticked]");
    const allBoxes = () => {
        return Array.from(form.querySelectorAll('input[name="customerIds"]'));
    };
    const refresh = () => {
        const ticked = allBoxes().filter((box) => {
            return box.checked;
        }).length;
        status.textContent = tickedMessage(ticked, limit);
    };

    for (const button of form.querySelectorAll("button[data-select]")) {
        button.addEventListener("click", () => {
            const boxes = allBoxes().filter((box) => {
                return box.dataset.group === button.dataset.group;
            });
            setGroup(boxes, button.dataset.select === "all");
            refresh();
        });
    }

    form.addEventListener("change", refresh);

    for (const part of form.querySelectorAll("[data-needs-script]")) {
        part.hidden = false;
    }

    status.hidden = false;
    refresh();
}

if (globalThis.document) {
    const form = globalThis.document.querySelector("form[data-rebooking]");

    if (form) {
        wire(form);
    }
}
