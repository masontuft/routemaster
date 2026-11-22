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

export function staffInviteMessage(url, role) {
    const safeUrl = escapeHtml(url);

    return {
        subject: "You’re invited to Routemaster",
        text: `An administrator invited you to join Routemaster as a ${role}. Set your password within seven days.\n\n${url}\n\nIf you were not expecting this invitation, contact your company administrator.`,
        html: `<p>An administrator invited you to join Routemaster as a ${escapeHtml(role)}.</p><p><a href="${safeUrl}">Set your password</a>. This link expires in seven days.</p><p>If you were not expecting this invitation, contact your company administrator.</p>`,
    };
}
