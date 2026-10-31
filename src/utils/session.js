// Promise wrappers so async controllers can use await and let Express 5 forward failures.
export function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            return error ? reject(error) : resolve();
        });
    });
}

export function destroySession(req) {
    return new Promise((resolve, reject) => {
        req.session.destroy((error) => {
            return error ? reject(error) : resolve();
        });
    });
}
