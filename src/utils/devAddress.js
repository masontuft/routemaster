import os from "node:os";

// The Mac's address on the local network, which is what a phone on the same Wi-Fi can reach. "localhost" would point
// at the phone itself. Falls back to localhost when there is no network.
export function lanAddress(interfaces = os.networkInterfaces()) {
    for (const addresses of Object.values(interfaces)) {
        const found = (addresses ?? []).find((address) => {
            return address.family === "IPv4" && !address.internal;
        });

        if (found) {
            return found.address;
        }
    }

    return "localhost";
}

// The link that opens a batch in Messenger running under Expo Go, which does not handle custom schemes. Development
// only: the caller must not offer it in production.
export function expoGoLink(token, { host = lanAddress(), port = process.env.EXPO_PORT || "8081" } = {}) {
    return `exp://${host}:${port}/--/batch/${token}`;
}

// The link as a QR code, drawn on the server as an inline SVG so nothing is fetched from anywhere. The library is a
// development-only dependency, loaded here on first use, so a production install never needs it and never calls this.
export async function qrSvg(text, label = "QR code") {
    const { default: qrcode } = await import("qrcode-generator");
    const code = qrcode(0, "M");
    code.addData(text);
    code.make();
    return code.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
        .replace("<svg ", `<svg width="220" height="220" role="img" aria-label="${label}" `);
}
