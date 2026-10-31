import createApp from "./app.js";

const port = Number(process.env.PORT) || 3000;

// Bind all interfaces: Render's proxy reaches the container over the network, not loopback.
createApp().listen(port, "0.0.0.0", () => {
    console.log(`Routemaster listening on port ${port}`);
});
