import { describe, expect, it } from "vitest";
import {
  backgroundRgb,
  flattenOver,
  isValidHexColor,
  normalizeHexColor,
  parseHexColor,
} from "./colours";

describe("parseHexColor", () => {
  it("parses six-digit hex with or without a hash", () => {
    expect(parseHexColor("#ff8800")).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseHexColor("FF8800")).toEqual({ r: 255, g: 136, b: 0 });
  });

  it("expands three-digit hex", () => {
    expect(parseHexColor("#f80")).toEqual({ r: 255, g: 136, b: 0 });
  });

  it("rejects anything else", () => {
    expect(parseHexColor("")).toBeNull();
    expect(parseHexColor("#ff88")).toBeNull();
    expect(parseHexColor("#ff88000")).toBeNull();
    expect(parseHexColor("orange")).toBeNull();
    expect(parseHexColor("#gg0000")).toBeNull();
  });
});

describe("isValidHexColor / normalizeHexColor", () => {
  it("validates and normalises", () => {
    expect(isValidHexColor("#F80")).toBe(true);
    expect(isValidHexColor("nope")).toBe(false);
    expect(normalizeHexColor("#F80")).toBe("#ff8800");
    expect(normalizeHexColor("AABBCC")).toBe("#aabbcc");
    expect(normalizeHexColor("nope")).toBeNull();
  });
});

describe("backgroundRgb", () => {
  it("maps each choice to a colour or transparency", () => {
    expect(backgroundRgb({ kind: "transparent" })).toBeNull();
    expect(backgroundRgb({ kind: "white" })).toEqual({ r: 255, g: 255, b: 255 });
    expect(backgroundRgb({ kind: "color", hex: "#000000" })).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("falls back to white for an unparseable custom colour", () => {
    expect(backgroundRgb({ kind: "color", hex: "junk" })).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe("flattenOver", () => {
  it("keeps fully opaque pixels untouched and forces alpha to 255", () => {
    const px = new Uint8ClampedArray([10, 20, 30, 255]);
    flattenOver(px, { r: 200, g: 200, b: 200 });
    expect(Array.from(px)).toEqual([10, 20, 30, 255]);
  });

  it("turns fully transparent pixels into the background colour", () => {
    const px = new Uint8ClampedArray([10, 20, 30, 0]);
    flattenOver(px, { r: 200, g: 100, b: 50 });
    expect(Array.from(px)).toEqual([200, 100, 50, 255]);
  });

  it("blends half-transparent pixels halfway", () => {
    const px = new Uint8ClampedArray([100, 100, 100, 128]);
    flattenOver(px, { r: 0, g: 0, b: 0 });
    // 100 * (128/255) ≈ 50.2 -> 50 after Uint8ClampedArray rounding.
    expect(px[0]).toBe(50);
    expect(px[3]).toBe(255);
  });
});
