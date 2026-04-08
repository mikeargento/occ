import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "OCC — Origin Controlled Computing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f5f5f5",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "72px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            fontSize: 260,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            color: "#111827",
            lineHeight: 1,
            display: "flex",
          }}
        >
          OCC
        </div>

        {/* Expanded name */}
        <div
          style={{
            marginTop: 18,
            fontSize: 30,
            fontWeight: 500,
            color: "#6b7280",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Origin Controlled Computing
        </div>

        {/* Divider */}
        <div
          style={{
            marginTop: 36,
            marginBottom: 28,
            width: 120,
            height: 3,
            background: "#0065A4",
            display: "flex",
          }}
        />

        {/* Tagline */}
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            color: "#0065A4",
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          Drop a file. Get a proof.
        </div>

        {/* Domain mark */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            right: 72,
            fontSize: 22,
            fontWeight: 500,
            color: "#9ca3af",
            fontFamily: "monospace",
            display: "flex",
          }}
        >
          occ.wtf
        </div>

        {/* Patent pending mark */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 72,
            fontSize: 18,
            fontWeight: 500,
            color: "#9ca3af",
            display: "flex",
          }}
        >
          Patent Pending
        </div>
      </div>
    ),
    { ...size }
  );
}
