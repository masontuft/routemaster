// Closes the header menus on a click outside them and on Escape. The menus are <details> elements, so they open and
// close without this file; it only stops an open menu from staying open while you do something else.

// Takes plain lists so it can be tested without a browser. A menu is { open, contains(node) }.
export function closeOthers(menus, target) {
    for (const menu of menus) {
        if (menu.open && !menu.contains(target)) {
            menu.open = false;
        }
    }
}

if (globalThis.document) {
    const doc = globalThis.document;
    const menus = () => {
        return [...doc.querySelectorAll("header details.menu")];
    };

    doc.addEventListener("click", (event) => {
        closeOthers(menus(), event.target);
    });
    doc.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }
        const open = menus().find((menu) => {
            return menu.open;
        });
        if (open) {
            open.open = false;
            open.querySelector("summary").focus();
        }
    });
}
