import * as MessengerBatch from "../models/messengerBatch.js";
import { validateMessengerResults } from "../utils/validation.js";

// The batch token is 32 random bytes in base64url, 43 characters. Anything else cannot be a token, so it is answered
// as not found without touching the database.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function notFound(res) {
    res.status(404).json({ error: "not_found" });
}

export async function fetchBatch(req, res) {
    if (!TOKEN_PATTERN.test(req.params.token)) {
        return notFound(res);
    }

    const origin = `${req.protocol}://${req.get("host")}`;
    const result = await MessengerBatch.fetchBatch(req.app.locals.db, req.params.token, origin);

    if (result.error) {
        return notFound(res);
    }

    res.json({ batchId: result.batchId, expiresAt: result.expiresAt, recipients: result.recipients });
}

export async function postResults(req, res) {
    if (!TOKEN_PATTERN.test(req.params.token)) {
        return notFound(res);
    }

    const { results, errors } = validateMessengerResults(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ error: "invalid_results", message: errors[0] });
    }

    const outcome = await MessengerBatch.recordResults(req.app.locals.db, req.params.token, results);

    if (outcome.error) {
        return notFound(res);
    }

    res.json({ updated: outcome.updated, ignored: outcome.ignored });
}
