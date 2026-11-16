import { describe, expect, it } from "vitest";
import { fileExtension, formatBytes, formatDimensions, replaceExtension } from "./format";

describe("formatBytes", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(224_005_088)).toBe("213.6 MB");
  });

  it("is defensive about bad input", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("replaceExtension / fileExtension", () => {
  it("swaps extensions and reads them back", () => {
    expect(replaceExtension("photo.JPG", "png")).toBe("photo.png");
    expect(replaceExtension("no-extension", "png")).toBe("no-extension.png");
    expect(fileExtension("photo.JPG")).toBe("jpg");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
    expect(fileExtension("no-extension")).toBe("");
  });
});

describe("formatDimensions", () => {
  it("formats a dimension label", () => {
    expect(formatDimensions(1600, 2400)).toBe("1600 × 2400");
  });
});
