// Alpha-mask maths for the cut-out pipeline.
//
// The segmentation model sees a small square copy of the photo and returns a
// single-channel mask at that small size. Everything that turns that mask
// into a full-resolution, edge-feathered alpha channel lives here as pure
// functions over typed arrays, so it can be unit-tested without a browser.
//
// Pipeline: model output -> maskFromModelOutput (sigmoid if the model emitted
// logits, clamp to 0..1) -> resizeMaskBilinear up to the photo's real size ->
// featherMask (a light blur so edges don't look scissored) -> applyMaskAsAlpha
// onto the original pixels. The photo itself is never resized.

/** The logistic sigmoid, used when a model emits logits instead of probabilities. */
export function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Normalise raw model output into a 0..1 probability mask.
 * Some exports emit probabilities directly; others emit logits (values well
 * outside 0..1). If any value falls outside [-0.01, 1.01] we treat the whole
 * tensor as logits and sigmoid it; either way the result is clamped to 0..1.
 */
export function maskFromModelOutput(data: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const isLogits = min < -0.01 || max > 1.01;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = clamp01(isLogits ? sigmoid(data[i]) : data[i]);
  }
  return out;
}

/**
 * Bilinear resize of a single-channel mask. Uses the half-pixel convention
 * (align_corners = false), matching how browsers scale images, so the mask
 * lines up with the photo it was predicted from.
 */
export function resizeMaskBilinear(
  src: Float32Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Float32Array {
  const out = new Float32Array(dstWidth * dstHeight);
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;
  for (let y = 0; y < dstHeight; y++) {
    const srcY = Math.min(srcHeight - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(srcY);
    const y1 = Math.min(srcHeight - 1, y0 + 1);
    const fy = srcY - y0;
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.min(srcWidth - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(srcX);
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const fx = srcX - x0;
      const top = src[y0 * srcWidth + x0] * (1 - fx) + src[y0 * srcWidth + x1] * fx;
      const bottom = src[y1 * srcWidth + x0] * (1 - fx) + src[y1 * srcWidth + x1] * fx;
      out[y * dstWidth + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/**
 * Soften mask edges with a separable box blur (two passes at the same radius
 * approximate a gaussian). Hard 0/1 mask edges look cut out with scissors;
 * a 1-2px feather at full resolution keeps hair and fabric edges believable.
 * Radius 0 returns an untouched copy.
 */
export function featherMask(
  mask: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius <= 0) return new Float32Array(mask);
  let current: Float32Array = new Float32Array(mask);
  for (let pass = 0; pass < 2; pass++) {
    current = boxBlurPass(current, width, height, radius, true);
    current = boxBlurPass(current, width, height, radius, false);
  }
  return current;
}

function boxBlurPass(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Float32Array {
  const out = new Float32Array(src.length);
  const length = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const windowSize = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const at = (i: number) => (horizontal ? line * width + i : i * width + line);
    // Sliding window with clamped edges: out-of-range samples repeat the
    // edge value, which keeps borders from darkening.
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      sum += src[at(Math.min(length - 1, Math.max(0, i)))];
    }
    for (let x = 0; x < length; x++) {
      out[at(x)] = sum / windowSize;
      const leaving = src[at(Math.min(length - 1, Math.max(0, x - radius)))];
      const entering = src[at(Math.min(length - 1, Math.max(0, x + radius + 1)))];
      sum += entering - leaving;
    }
  }
  return out;
}

/**
 * Write a 0..1 mask into the alpha channel of an RGBA pixel buffer, in place.
 * The mask multiplies any alpha the image already has (a PNG with existing
 * transparency keeps the intersection of both).
 */
export function applyMaskAsAlpha(rgba: Uint8ClampedArray, mask: Float32Array): void {
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4 + 3;
    rgba[offset] = Math.round((rgba[offset] / 255) * mask[i] * 255);
  }
}

/** Summary of a mask, for verification and for honest UI copy. */
export function maskCoverage(mask: Float32Array): {
  subjectFraction: number;
  transparentFraction: number;
  partialFraction: number;
} {
  let subject = 0;
  let transparent = 0;
  let partial = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0.98) subject++;
    else if (mask[i] < 0.02) transparent++;
    else partial++;
  }
  const total = mask.length || 1;
  return {
    subjectFraction: subject / total,
    transparentFraction: transparent / total,
    partialFraction: partial / total,
  };
}

export interface Normalization {
  /** Pixel values are divided by this first (255 for 0..1 models, 1 for raw 0..255 models). */
  scale: number;
  mean: readonly [number, number, number];
  std: readonly [number, number, number];
}

/**
 * Build the model's input tensor from RGBA pixels: NCHW float32, normalised
 * as (pixel / scale - mean) / std with the values the model was trained with
 * (ISNet: scale 1, mean 128, std 256; BiRefNet: scale 255, ImageNet mean/std).
 */
export function rgbaToModelInput(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  norm: Normalization,
): Float32Array {
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (rgba[i * 4 + c] / norm.scale - norm.mean[c]) / norm.std[c];
    }
  }
  return out;
}
