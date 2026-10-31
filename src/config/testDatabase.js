// Tests may only touch the database named by TEST_DATABASE_URL, never DATABASE_URL.
export function getTestDatabaseUrl(env = process.env) {
    const testUrl = env.TEST_DATABASE_URL;

    if (!testUrl) {
        throw new Error("TEST_DATABASE_URL is not set. Refusing to run database tests.");
    }

    if (testUrl === env.DATABASE_URL) {
        throw new Error("TEST_DATABASE_URL equals DATABASE_URL. Refusing to run database tests.");
    }

    return testUrl;
}
