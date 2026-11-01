const VIEWS = { 403: "403", 404: "404", 429: "429" };
const TITLES = { 403: "Access denied", 404: "Not found", 429: "Too many requests" };

// The one place errors are handled. Never send error details to the browser.
export default function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    const status = VIEWS[error.status] ? error.status : 500;

    if (status === 500) {
        console.error(error);
    }

    const pageStyle = status === 403 || status === 429 ? "app" : "loud";

    res.status(status).render(VIEWS[status] ?? "error", { title: TITLES[status] ?? "Error", pageStyle });
}
