import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#22c55e",
          fontSize: 128,
          fontWeight: 700,
        }}
      >
        F
      </div>
    ),
    { width: 192, height: 192 },
  );
}
