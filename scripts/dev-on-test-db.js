import { spawn } from "node:child_process";
import { getTestDatabaseUrl } from "../src/config/testDatabase.js";

// Same as `pnpm dev`, but the app's DATABASE_URL is the test database. A variable already in the environment wins
// over the .env file, so setting it here for the child is enough. The guard runs first, so a missing or matching
// TEST_DATABASE_URL stops here. It listens on 3100 unless PORT is set, so it never clashes with `pnpm dev` on 3000,
// and Sprinkler Messenger's dev builds look for the test server on 3100.
process.loadEnvFile(".env");
const testUrl = getTestDatabaseUrl();

const child = spawn(process.execPath, [
    "--watch", "--watch-path=src", "--watch-path=public", "--watch-preserve-output",
    "--env-file-if-exists=.env", "src/server.js",
], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development", DATABASE_URL: testUrl, PORT: process.env.PORT || "3100" },
});

child.on("exit", (code) => {
    process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        child.kill(signal);
    });
}
