import { test } from "node:test";
import assert from "node:assert";
import { getTestDatabaseUrl } from "./testDatabase.js";

test("returns the test database URL when it is set and differs from DATABASE_URL", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://test",
        DATABASE_URL: "postgres://real",
    };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://test");
});

test("refuses when TEST_DATABASE_URL is missing", () => {
    assert.throws(() => {
        return getTestDatabaseUrl({ DATABASE_URL: "postgres://real" });
    }, /not set/);
});

test("refuses when TEST_DATABASE_URL is empty", () => {
    assert.throws(() => {
        return getTestDatabaseUrl({ TEST_DATABASE_URL: "" });
    }, /not set/);
});

test("refuses when TEST_DATABASE_URL equals DATABASE_URL", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://same",
        DATABASE_URL: "postgres://same",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when TEST_DATABASE_URL is only whitespace", () => {
    assert.throws(() => {
        return getTestDatabaseUrl({ TEST_DATABASE_URL: "   " });
    }, /not set/);
});

test("trims TEST_DATABASE_URL when the databases differ", () => {
    const env = {
        TEST_DATABASE_URL: "  postgres://localhost:5432/routemaster_test  ",
        DATABASE_URL: "postgres://localhost:5432/routemaster",
    };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://localhost:5432/routemaster_test");
});

test("ignores a blank DATABASE_URL", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost:5432/routemaster_test",
        DATABASE_URL: "   ",
    };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://localhost:5432/routemaster_test");
});

test("allows the local dev database and the throwaway database on the same host", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://user:password@localhost:5432/routemaster_test",
        DATABASE_URL: "postgres://user:password@localhost:5432/routemaster",
    };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://user:password@localhost:5432/routemaster_test");
});

test("allows the same database name on a different host", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost:5432/routemaster",
        DATABASE_URL: "postgres://db.example:5432/routemaster",
    };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://localhost:5432/routemaster");
});

test("refuses when the URLs differ only by scheme, credentials, default port, or a trailing slash", () => {
    const env = {
        TEST_DATABASE_URL: "postgresql://user:other@localhost/routemaster/",
        DATABASE_URL: "postgres://user:password@localhost:5432/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when the only difference is an ignored query parameter", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost:5432/routemaster?sslmode=disable",
        DATABASE_URL: "postgres://localhost:5432/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when the database name is percent-encoded", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost/route%6daster",
        DATABASE_URL: "postgres://localhost/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when the host or database name differs only by case", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://LOCALHOST:5432/RouteMaster",
        DATABASE_URL: "postgres://localhost/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when a dbname query parameter selects the real database", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost/routemaster_test?dbname=routemaster",
        DATABASE_URL: "postgres://localhost/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when the dbname query parameter name differs only by case", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost/routemaster_test?DBNAME=routemaster",
        DATABASE_URL: "postgres://localhost/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when a host query parameter points at the real server", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost/routemaster?host=db.example",
        DATABASE_URL: "postgres://db.example/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when hostaddr is the real address", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost/routemaster?hostaddr=10.0.0.8",
        DATABASE_URL: "postgres://10.0.0.8/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses when a leading-zero port is the same port", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost:05432/routemaster",
        DATABASE_URL: "postgres://localhost:5432/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("allows a different port on the same host", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost:5433/routemaster",
        DATABASE_URL: "postgres://localhost:5432/routemaster",
    };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://localhost:5433/routemaster");
});

test("refuses when an omitted database name defaults to the same user", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost?user=alice",
        DATABASE_URL: "postgres://alice@localhost",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("allows two omitted database names that default to different users", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://bob@localhost",
        DATABASE_URL: "postgres://alice@localhost",
    };
    assert.strictEqual(getTestDatabaseUrl(env), "postgres://bob@localhost");
});

test("refuses when a trailing dot on the host is the only difference", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost./routemaster",
        DATABASE_URL: "postgres://localhost/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses matching IPv6 hosts written with and without a port", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://[::1]/routemaster",
        DATABASE_URL: "postgres://[::1]:5432/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /equals DATABASE_URL/);
});

test("refuses a non-Postgres URL", () => {
    assert.throws(() => {
        return getTestDatabaseUrl({ TEST_DATABASE_URL: "mysql://localhost/routemaster_test" });
    }, /not a Postgres connection URL/);
});

test("refuses an unparseable TEST_DATABASE_URL", () => {
    assert.throws(() => {
        return getTestDatabaseUrl({ TEST_DATABASE_URL: "not a url" });
    }, /not a Postgres connection URL/);
});

test("refuses a database name that cannot be decoded", () => {
    assert.throws(() => {
        return getTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://localhost/foo%ZZ" });
    }, /not a Postgres connection URL/);
});

test("refuses when DATABASE_URL is set but is not a Postgres URL", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://localhost/routemaster_test",
        DATABASE_URL: "not a url",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, /DATABASE_URL is not a Postgres connection URL/);
});

test("refusal errors do not include the connection string", () => {
    const env = {
        TEST_DATABASE_URL: "postgres://user:super-secret-password@localhost:5432/routemaster",
        DATABASE_URL: "postgres://user:super-secret-password@localhost:5432/routemaster",
    };
    assert.throws(() => {
        return getTestDatabaseUrl(env);
    }, (error) => {
        assert.strictEqual(error.message.includes("super-secret-password"), false);
        assert.strictEqual(error.message.includes("postgres://"), false);
        assert.match(error.message, /equals DATABASE_URL/);
        return true;
    });
});
