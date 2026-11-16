// Output size presets for marketplace sellers.
//
// Marketplaces cap or recommend the longest edge of a product photo. A preset
// shrinks a cut-out so its longest edge matches the target — and never
// upscales: enlarging a photo invents pixels and makes listings look worse,
// so a photo already smaller than the preset keeps its original size.

export interface SizePreset {
  id: string;
  label: string;
  /** Longest-edge target in pixels, or null to keep the original size. */
  longestEdge: number | null;
  hint: string;
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "original", label: "Original size", longestEdge: null, hint: "Full resolution, untouched" },
  { id: "amazon", label: "Amazon", longestEdge: 2000, hint: "Longest edge 2000px" },
  { id: "ebay", label: "eBay", longestEdge: 1600, hint: "Longest edge 1600px" },
  { id: "etsy", label: "Etsy", longestEdge: 2700, hint: "Longest edge 2700px" },
  { id: "shopify", label: "Shopify", longestEdge: 2048, hint: "Longest edge 2048px" },
];

export function presetById(id: string): SizePreset {
  return SIZE_PRESETS.find((preset) => preset.id === id) ?? SIZE_PRESETS[0];
}

export interface FittedSize {
  width: number;
  height: number;
  /** True when the image was actually shrunk to fit. */
  scaled: boolean;
}

/**
 * Fit (width, height) so the longest edge is at most `longestEdge`.
 * A null edge — or an image already small enough — returns the input size.
 */
export function fitWithinLongestEdge(
  width: number,
  height: number,
  longestEdge: number | null,
): FittedSize {
  const longest = Math.max(width, height);
  if (longestEdge === null || longestEdge <= 0 || longest <= longestEdge) {
    return { width, height, scaled: false };
  }
  const scale = longestEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}
