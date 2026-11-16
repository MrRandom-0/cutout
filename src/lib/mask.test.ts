import { describe, expect, it } from "vitest";
import {
  applyMaskAsAlpha,
  featherMask,
  maskCoverage,
  maskFromModelOutput,
  resizeMaskBilinear,
  rgbaToModelInput,
  sigmoid,
} from "./mask";

describe("sigmoid", () => {
  it("maps 0 to 0.5 and saturates at the extremes", () => {
    expect(sigmoid(0)).toBeCloseTo(0.5);
    expect(sigmoid(20)).toBeCloseTo(1, 5);
    expect(sigmoid(-20)).toBeCloseTo(0, 5);
  });
});

describe("maskFromModelOutput", () => {
  it("passes probabilities through, clamped", () => {
    const out = maskFromModelOutput(new Float32Array([0, 0.25, 0.5, 1]));
    expect(Array.from(out)).toEqual([0, 0.25, 0.5, 1]);
  });

  it("sigmoids logits", () => {
    const out = maskFromModelOutput(new Float32Array([-10, 0, 10]));
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(1, 3);
  });

  it("treats values above 1 as logits too", () => {
    const out = maskFromModelOutput(new Float32Array([0.2, 2.5]));
    expect(out[1]).toBeCloseTo(sigmoid(2.5));
  });
});

describe("resizeMaskBilinear", () => {
  it("keeps a same-size mask identical", () => {
    const src = new Float32Array([0, 0.5, 1, 0.25]);
    const out = resizeMaskBilinear(src, 2, 2, 2, 2);
    expect(Array.from(out)).toEqual([0, 0.5, 1, 0.25]);
  });

  it("upscales a single pixel to a constant mask", () => {
    const out = resizeMaskBilinear(new Float32Array([0.7]), 1, 1, 4, 3);
    expect(out).toHaveLength(12);
    for (const v of out) expect(v).toBeCloseTo(0.7);
  });

  it("interpolates between neighbours when upscaling", () => {
    // 2x1 gradient [0, 1] -> 4x1 should ramp smoothly and stay in range.
    const out = resizeMaskBilinear(new Float32Array([0, 1]), 2, 1, 4, 1);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[3]).toBeCloseTo(1, 5);
    expect(out[1]).toBeGreaterThan(0);
    expect(out[1]).toBeLessThan(out[2]);
    expect(out[2]).toBeLessThan(1);
  });

  it("downscales by averaging the neighbourhood", () => {
    const src = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
    const out = resizeMaskBilinear(src, 4, 4, 2, 2);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });
});

describe("featherMask", () => {
  it("radius 0 returns an equal copy, not the same array", () => {
    const src = new Float32Array([0, 1, 0, 1]);
    const out = featherMask(src, 2, 2, 0);
    expect(Array.from(out)).toEqual([0, 1, 0, 1]);
    expect(out).not.toBe(src);
  });

  it("softens a hard step edge", () => {
    // 6x1: left half background, right half subject.
    const src = new Float32Array([0, 0, 0, 1, 1, 1]);
    const out = featherMask(src, 6, 1, 1);
    expect(out[2]).toBeGreaterThan(0);
    expect(out[2]).toBeLessThan(1);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[3]).toBeLessThan(1);
    // Still monotonic across the edge.
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });

  it("leaves a constant mask constant", () => {
    const out = featherMask(new Float32Array(16).fill(0.4), 4, 4, 2);
    for (const v of out) expect(v).toBeCloseTo(0.4);
  });
});

describe("applyMaskAsAlpha", () => {
  it("writes mask values into the alpha channel", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    applyMaskAsAlpha(rgba, new Float32Array([1, 0]));
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(0);
    // Colour channels are untouched.
    expect(rgba[0]).toBe(10);
    expect(rgba[4]).toBe(40);
  });

  it("multiplies existing alpha instead of replacing it", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 128]);
    applyMaskAsAlpha(rgba, new Float32Array([0.5]));
    expect(rgba[3]).toBe(64);
  });
});

describe("maskCoverage", () => {
  it("reports subject / transparent / partial fractions", () => {
    const mask = new Float32Array([1, 1, 0, 0.5]);
    const coverage = maskCoverage(mask);
    expect(coverage.subjectFraction).toBeCloseTo(0.5);
    expect(coverage.transparentFraction).toBeCloseTo(0.25);
    expect(coverage.partialFraction).toBeCloseTo(0.25);
  });
});

describe("rgbaToModelInput", () => {
  it("produces NCHW planes normalised with mean/std", () => {
    // One red pixel, one blue pixel; 2x1 image.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const out = rgbaToModelInput(rgba, 2, 1, {
      scale: 255,
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5],
    });
    expect(out).toHaveLength(6);
    // R plane: (1 - .5)/.5 = 1, (0 - .5)/.5 = -1
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(-1);
    // B plane starts at index 4: pixel0 blue=0 -> -1, pixel1 blue=1 -> 1
    expect(out[4]).toBeCloseTo(-1);
    expect(out[5]).toBeCloseTo(1);
  });

  it("supports raw 0..255 normalisation (the ISNet convention)", () => {
    const rgba = new Uint8ClampedArray([128, 255, 0, 255]);
    const out = rgbaToModelInput(rgba, 1, 1, {
      scale: 1,
      mean: [128, 128, 128],
      std: [256, 256, 256],
    });
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(127 / 256);
    expect(out[2]).toBeCloseTo(-0.5);
  });
});
