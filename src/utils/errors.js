export function forbidden() {
    const error = new Error("Forbidden");
    error.status = 403;
    return error;
}

export function notFound() {
    const error = new Error("Page not found");
    error.status = 404;
    return error;
}
