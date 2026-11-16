import { describe, expect, it } from "vitest";
import { fitWithinLongestEdge, presetById, SIZE_PRESETS } from "./presets";

describe("SIZE_PRESETS", () => {
  it("includes the four marketplace targets from the product brief", () => {
    const byId = Object.fromEntries(SIZE_PRESETS.map((p) => [p.id, p.longestEdge]));
    expect(byId.amazon).toBe(2000);
    expect(byId.ebay).toBe(1600);
    expect(byId.etsy).toBe(2700);
    expect(byId.shopify).toBe(2048);
    expect(byId.original).toBeNull();
  });
});

describe("presetById", () => {
  it("falls back to Original for unknown ids", () => {
    expect(presetById("nope").id).toBe("original");
    expect(presetById("ebay").id).toBe("ebay");
  });
});

describe("fitWithinLongestEdge", () => {
  it("returns the input when no preset is chosen", () => {
    expect(fitWithinLongestEdge(4000, 3000, null)).toEqual({
      width: 4000,
      height: 3000,
      scaled: false,
    });
  });

  it("never upscales an image smaller than the preset", () => {
    expect(fitWithinLongestEdge(1200, 900, 2000)).toEqual({
      width: 1200,
      height: 900,
      scaled: false,
    });
  });

  it("shrinks landscape by its width", () => {
    expect(fitWithinLongestEdge(4000, 3000, 2000)).toEqual({
      width: 2000,
      height: 1500,
      scaled: true,
    });
  });

  it("shrinks portrait by its height", () => {
    expect(fitWithinLongestEdge(1600, 2400, 1600)).toEqual({
      width: 1067,
      height: 1600,
      scaled: true,
    });
  });

  it("never produces a zero dimension", () => {
    const fitted = fitWithinLongestEdge(10000, 3, 100);
    expect(fitted.width).toBe(100);
    expect(fitted.height).toBe(1);
  });
});
