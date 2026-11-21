import { Resend } from "resend";

// A small boundary around Resend keeps provider details out of controllers and makes missing configuration explicit.
export function createEmailSender({ apiKey, from, resendClient } = {}) {
    const client = resendClient ?? (apiKey ? new Resend(apiKey) : null);
    const configured = Boolean(client && from);

    return {
        configured,
        async send({ to, subject, text, html }) {
            if (!configured) {
                throw new Error("Email sending is not configured.");
            }

            const { data, error } = await client.emails.send({ from, to, subject, text, html });

            if (error) {
                throw new Error("Resend rejected the email request.");
            }

            return data;
        },
    };
}
