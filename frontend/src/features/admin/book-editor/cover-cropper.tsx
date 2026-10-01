"use client";

import { useId, type CSSProperties } from "react";
import { cropRect, maxZoom, type CropState } from "../crop";

function Slider({ label, value, min, max, step, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

/**
 * Frame the cover as a 2:3 book front. The preview shows exactly the region that will be sent as
 * the crop, so what the editor sees is what the store shows.
 */
export function CoverCropper({
  src,
  width,
  height,
  value,
  onChange,
}: {
  src: string;
  width: number;
  height: number;
  value: CropState;
  onChange: (value: CropState) => void;
}) {
  const rect = cropRect(width, height, value);
  const zoomLimit = maxZoom(width, height);
  const canMoveX = rect.width < width;
  const canMoveY = rect.height < height;

  // Position the full image so the crop rectangle fills the 2:3 frame.
  const imageStyle: CSSProperties = {
    width: `${(width / rect.width) * 100}%`,
    left: `${(-rect.x / rect.width) * 100}%`,
    top: `${(-rect.y / rect.height) * 100}%`,
  };

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start">
      <div className="relative mx-auto aspect-[2/3] w-48 overflow-hidden rounded-r-md rounded-l-sm bg-surface-sunken shadow-lg ring-1 ring-border sm:w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset */}
        <img src={src} alt="Cover crop preview" className="absolute max-w-none select-none" style={imageStyle} draggable={false} />
      </div>
      <div className="flex flex-col gap-4">
        <Slider label="Zoom" value={value.zoom} min={1} max={zoomLimit} step={0.01} disabled={zoomLimit <= 1} onChange={(zoom) => onChange({ ...value, zoom })} />
        <Slider label="Left – right" value={value.focusX} min={0} max={1} step={0.005} disabled={!canMoveX} onChange={(focusX) => onChange({ ...value, focusX })} />
        <Slider label="Top – bottom" value={value.focusY} min={0} max={1} step={0.005} disabled={!canMoveY} onChange={(focusY) => onChange({ ...value, focusY })} />
        <p className="text-xs text-text-subtle tabular-nums">
          Using {rect.width}×{rect.height}px of the {width}×{height}px image.
        </p>
      </div>
    </div>
  );
}
