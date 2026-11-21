function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return entities[character];
    });
}

export function passwordResetMessage(url) {
    const safeUrl = escapeHtml(url);

    return {
        subject: "Reset your Routemaster password",
        text: `Use this link to choose a new Routemaster password. It expires in 30 minutes.\n\n${url}\n\nIf you did not request a reset, you can ignore this email.`,
        html: `<p>Use this link to choose a new Routemaster password. It expires in 30 minutes.</p><p><a href="${safeUrl}">Choose a new password</a></p><p>If you did not request a reset, you can ignore this email.</p>`,
    };
}
