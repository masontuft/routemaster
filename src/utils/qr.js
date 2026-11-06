import qrcode from "qrcode-generator";

// A link as a QR code, drawn on the server as an inline SVG so nothing is fetched from anywhere. label names the
// picture for screen readers and must be plain text written in code, never user input, because it is not escaped.
export function qrSvg(text, label = "QR code") {
    const code = qrcode(0, "M");
    code.addData(text);
    code.make();
    return code.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
        .replace("<svg ", `<svg width="220" height="220" role="img" aria-label="${label}" `);
}
