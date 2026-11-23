// Shows the New Area field on the property edit page only while "No area/Other" is chosen. The page works without
// this file: the field is visible until it runs, so without scripts staff can still type a new area name.
//
// A hidden field is also disabled, so a name typed before choosing a listed area is not posted and cannot fight the
// choice. The text is kept, so choosing "No area/Other" again brings it back.

// select is { value }, group is { hidden }, field is { disabled }. These take plain objects so they can be tested
// without a browser.
export function showNewAreaField(select, group, field) {
    const show = select.value === "";
    group.hidden = !show;
    field.disabled = !show;
}

export function wire(select, group, field) {
    const refresh = () => {
        showNewAreaField(select, group, field);
    };

    select.addEventListener("change", refresh);
    refresh();
}

const select = globalThis.document?.getElementById("subdivisionId");
const group = globalThis.document?.querySelector("[data-new-area]");
const field = globalThis.document?.getElementById("newAreaName");

if (select && group && field) {
    wire(select, group, field);
}
