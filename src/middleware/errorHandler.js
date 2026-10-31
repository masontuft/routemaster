// The one place errors are handled. Never send error details to the browser.
export default function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    const status = error.status === 404 ? 404 : 500;

    if (status === 500) {
        console.error(error);
    }

    res.status(status).render(status === 404 ? "404" : "error", { title: status === 404 ? "Not found" : "Error" });
}
