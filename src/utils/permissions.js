// Which staff roles may change which fields. Name and street are the keys that customer matching uses (the
// scheduling form, the import), so only the owner changes them. Contact details and the city/ZIP are open to
// the dispatcher too. One map drives both the form (which inputs appear) and the route (which posted fields
// are refused), so the two cannot disagree.
const EDITABLE = {
    customer: {
        name: ["owner"],
        phone: ["owner", "dispatcher"],
        email: ["owner", "dispatcher"],
    },
    property: {
        street: ["owner"],
        city: ["owner", "dispatcher"],
        zip: ["owner", "dispatcher"],
        notes: ["owner", "dispatcher"],
        subdivisionId: ["owner", "dispatcher"],
    },
};

export function editableFields(kind, role) {
    return Object.entries(EDITABLE[kind]).filter(([, roles]) => {
        return roles.includes(role);
    }).map(([field]) => {
        return field;
    });
}

// Posted fields that belong to this record but that the role may not change. Unknown fields are ignored.
export function refusedFields(kind, role, body) {
    const allowed = editableFields(kind, role);
    return Object.keys(EDITABLE[kind]).filter((field) => {
        return field in body && allowed.includes(field) === false;
    });
}
