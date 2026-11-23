// Stops a form with data-once from being posted twice: a second click, or Enter pressed again, while the first post is
// on its way would otherwise send a second request. The page works without this file; the server refuses a second
// request for the same thing, but the browser drops the first response, so keeping the second request from being sent
// at all is what lets the person see the first response.
//
// The first submit goes through and the button is disabled in a later task, because a button disabled during its own
// click is left out of the posted form. A second submit event is cancelled.

// form is { dataset: { submitted? } }, button is { disabled }, event is { preventDefault }. These take plain objects so
// they can be tested without a browser. Returns true when this submit may go ahead.
export function allowSubmit(form, event) {
    if (form.dataset.submitted === "1") {
        event.preventDefault();
        return false;
    }

    form.dataset.submitted = "1";
    return true;
}

// Going Back restores the page from the browser's cache with the button still disabled, so the form is made usable
// again. The server's own check still refuses a second batch for the same source.
export function reset(form, button) {
    delete form.dataset.submitted;
    button.disabled = false;
}

export function wire(form, button, defer = (work) => {
    globalThis.setTimeout(work, 0);
}) {
    form.addEventListener("submit", (event) => {
        if (allowSubmit(form, event)) {
            defer(() => {
                button.disabled = true;
            });
        }
    });
    globalThis.addEventListener?.("pageshow", (event) => {
        if (event.persisted) {
            reset(form, button);
        }
    });
}

for (const form of globalThis.document?.querySelectorAll("form[data-once]") ?? []) {
    const button = form.querySelector("button[type=submit]");

    if (button) {
        wire(form, button);
    }
}
