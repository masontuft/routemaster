const VIEWS = { 403: "403", 404: "404" };
const TITLES = { 403: "Access denied", 404: "Not found" };

// The one place errors are handled. Never send error details to the browser.
export default function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    const status = VIEWS[error.status] ? error.status : 500;

    if (status === 500) {
        console.error(error);
    }

    res.status(status).render(VIEWS[status] ?? "error", { title: TITLES[status] ?? "Error" });
}
