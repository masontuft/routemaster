import createApp from "./app.js";
import { createGeocoder } from "./geocoding/geocoder.js";
import { createPool } from "./db/pool.js";
import { missingEnvVariables, sessionSecretProblem } from "./utils/env.js";

const port = Number(process.env.PORT) || 3000;

const missing = missingEnvVariables();

if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}.`);
    process.exit(1);
}

const secretProblem = sessionSecretProblem(process.env.SESSION_SECRET);

if (secretProblem) {
    console.error(secretProblem);
    process.exit(1);
}

const app = createApp({
    pool: createPool(process.env.DATABASE_URL),
    sessionSecret: process.env.SESSION_SECRET,
    geocode: createGeocoder({ apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "" }),
    serviceState: process.env.SERVICE_STATE ?? "",
    routeStartAddress: process.env.ROUTE_START_ADDRESS ?? "",
});

// Bind all interfaces: Render's proxy reaches the container over the network, not loopback.
app.listen(port, "0.0.0.0", () => {
    console.log(`Routemaster listening on port ${port}`);
});
