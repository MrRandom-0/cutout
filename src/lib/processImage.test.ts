import { describe, expect, it } from "vitest";
import { outputName } from "./processImage";

describe("outputName", () => {
  it("adds -cutout and swaps the extension to the export format", () => {
    expect(outputName("product.jpg", "png")).toBe("product-cutout.png");
    expect(outputName("product.png", "jpeg")).toBe("product-cutout.jpg");
  });

  it("handles names without an extension and with several dots", () => {
    expect(outputName("photo", "png")).toBe("photo-cutout.png");
    expect(outputName("my.photo.final.jpeg", "png")).toBe("my.photo.final-cutout.png");
  });
});
