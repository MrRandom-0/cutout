// Background choices and colour handling.
//
// A cut-out can be downloaded three ways: transparent (alpha preserved),
// flattened onto white, or flattened onto a custom colour. This module owns
// the colour maths: parsing the hex a user types, and flattening an RGBA
// pixel buffer over a solid colour. Pure and dependency-free for testing.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** What goes behind the subject in the exported image. */
export type BackgroundChoice =
  { kind: "transparent" } | { kind: "white" } | { kind: "color"; hex: string };

export const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * Parse a CSS hex colour: "#f80", "ff8800", "#FF8800" all work.
 * Returns null for anything that is not exactly 3 or 6 hex digits.
 */
export function parseHexColor(input: string): Rgb | null {
  const clean = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$/.test(clean) && !/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function isValidHexColor(input: string): boolean {
  return parseHexColor(input) !== null;
}

/** Normalise a valid hex colour to lowercase "#rrggbb" form. */
export function normalizeHexColor(input: string): string | null {
  const rgb = parseHexColor(input);
  if (!rgb) return null;
  const part = (n: number) => n.toString(16).padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

/** The solid colour a background choice flattens onto, or null if transparent. */
export function backgroundRgb(choice: BackgroundChoice): Rgb | null {
  switch (choice.kind) {
    case "transparent":
      return null;
    case "white":
      return WHITE;
    case "color":
      return parseHexColor(choice.hex) ?? WHITE;
  }
}

/**
 * Flatten RGBA pixels over a solid background colour, in place:
 * out = fg * a + bg * (1 - a), with alpha forced to fully opaque.
 * This is the standard "over" composite for a single solid backdrop.
 */
export function flattenOver(rgba: Uint8ClampedArray, bg: Rgb): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    rgba[i] = rgba[i] * a + bg.r * (1 - a);
    rgba[i + 1] = rgba[i + 1] * a + bg.g * (1 - a);
    rgba[i + 2] = rgba[i + 2] * a + bg.b * (1 - a);
    rgba[i + 3] = 255;
  }
}
