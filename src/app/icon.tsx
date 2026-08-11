import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const dmSerifDisplay = readFile(
  path.join(process.cwd(), "src/assets/fonts/DMSerifDisplay-Regular.ttf"),
);

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default async function Icon() {
  const dmSerifDisplayData = await dmSerifDisplay;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#c39d60",
          color: "#000000",
          display: "flex",
          fontFamily: "DM Serif Display",
          fontSize: 54,
          fontWeight: 400,
          height: "100%",
          justifyContent: "center",
          lineHeight: 1,
          width: "100%",
        }}
      >
        f
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "DM Serif Display",
          data: dmSerifDisplayData,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
