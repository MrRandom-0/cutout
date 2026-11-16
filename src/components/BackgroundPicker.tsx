import { useState } from "react";
import { isValidHexColor, normalizeHexColor, type BackgroundChoice } from "../lib/colours";

interface BackgroundPickerProps {
  value: BackgroundChoice;
  onChange: (choice: BackgroundChoice) => void;
}

const OPTIONS: { kind: BackgroundChoice["kind"]; label: string }[] = [
  { kind: "transparent", label: "Transparent" },
  { kind: "white", label: "White" },
  { kind: "color", label: "Colour" },
];

/**
 * Background choice for exports: transparent, white, or a custom colour
 * (native colour input + a hex field, kept in sync; the hex field validates
 * before applying so a half-typed value never reaches the export).
 */
export default function BackgroundPicker({ value, onChange }: BackgroundPickerProps) {
  const [hexDraft, setHexDraft] = useState("#157a64");
  const activeHex = value.kind === "color" ? value.hex : hexDraft;
  const hexValid = isValidHexColor(activeHex);

  function choose(kind: BackgroundChoice["kind"]) {
    if (kind === "transparent") onChange({ kind: "transparent" });
    else if (kind === "white") onChange({ kind: "white" });
    else onChange({ kind: "color", hex: normalizeHexColor(activeHex) ?? "#ffffff" });
  }

  function applyHex(raw: string) {
    setHexDraft(raw);
    const normalized = normalizeHexColor(raw);
    if (normalized) onChange({ kind: "color", hex: normalized });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Background">
        {OPTIONS.map((option) => {
          const active = value.kind === option.kind;
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(option.kind)}
              className={[
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-teal-700 text-white shadow-pop"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600",
              ].join(" ")}
            >
              {option.kind === "transparent" ? (
                <span className="checkerboard h-3.5 w-3.5 rounded-full border border-zinc-300" />
              ) : (
                <span
                  className="h-3.5 w-3.5 rounded-full border border-zinc-300"
                  style={{
                    backgroundColor:
                      option.kind === "white"
                        ? "#ffffff"
                        : (normalizeHexColor(activeHex) ?? "#ffffff"),
                  }}
                />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
      {value.kind === "color" ? (
        <div className="mt-3 flex items-center gap-2.5">
          <input
            type="color"
            aria-label="Pick a background colour"
            value={normalizeHexColor(activeHex) ?? "#ffffff"}
            onChange={(event) => applyHex(event.target.value)}
            className="h-9 w-12 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="text"
            aria-label="Background colour as hex"
            value={activeHex}
            onChange={(event) => applyHex(event.target.value)}
            spellCheck={false}
            className="w-28 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
          {!hexValid ? (
            <span className="text-sm text-red-600 dark:text-red-400">
              Use a hex colour like #157a64
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
