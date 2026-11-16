import { ChevronsLeftRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { backgroundRgb, type BackgroundChoice } from "../lib/colours";

interface CompareSliderProps {
  /** Object URL of the original photo. */
  originalUrl: string;
  /** The full-resolution cut-out canvas. */
  result: HTMLCanvasElement;
  /** Background currently chosen for export — the preview matches it. */
  background: BackgroundChoice;
  alt: string;
}

/**
 * Before/after comparison: the original photo clipped over the cut-out by a
 * draggable divider. The cut-out is drawn onto a preview canvas flattened
 * over the chosen background (or the checkerboard when transparent), so the
 * preview is the export, not an approximation of it.
 */
export default function CompareSlider({
  originalUrl,
  result,
  background,
  alt,
}: CompareSliderProps) {
  const [position, setPosition] = useState(50);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.width = result.width;
    preview.height = result.height;
    const ctx = preview.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const bg = backgroundRgb(background);
    if (bg) {
      ctx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
      ctx.fillRect(0, 0, preview.width, preview.height);
    }
    ctx.drawImage(result, 0, 0);
  }, [result, background]);

  const transparent = background.kind === "transparent";

  return (
    <div
      className={`relative overflow-hidden rounded-xl select-none ${
        transparent ? "checkerboard" : "bg-white"
      }`}
    >
      <canvas ref={previewRef} className="block h-auto w-full" aria-label={alt} />
      <img
        src={originalUrl}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-fill"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      {/* Divider + handle */}
      <div
        aria-hidden
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `calc(${position}% - 1px)` }}
      />
      <div
        aria-hidden
        className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-700 shadow-lift"
        style={{ left: `${position}%` }}
      >
        <ChevronsLeftRight className="h-5 w-5" />
      </div>
      <span className="absolute top-3 left-3 rounded-full bg-zinc-950/70 px-2.5 py-1 text-xs font-semibold text-white">
        Before
      </span>
      <span className="absolute top-3 right-3 rounded-full bg-zinc-950/70 px-2.5 py-1 text-xs font-semibold text-white">
        After
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label="Reveal original photo"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
