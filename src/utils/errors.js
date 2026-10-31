export function notFound() {
    const error = new Error("Page not found");
    error.status = 404;
    return error;
}
