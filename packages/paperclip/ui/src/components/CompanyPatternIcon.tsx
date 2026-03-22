import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";

interface CompanyPatternIconProps {
  companyName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  className?: string;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function makeCompanyGradientDataUrl(seed: string, brandColor?: string | null, size = 88): string {
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const rand = mulberry32(hashString(seed));

  // Derive hue from brand color or generate one
  let hue: number;
  let sat: number;
  if (brandColor && brandColor.startsWith("#") && brandColor.length >= 7) {
    const [h, s] = hexToHSL(brandColor);
    hue = h;
    sat = Math.max(s, 40);
  } else {
    hue = Math.floor(rand() * 360);
    sat = 50 + Math.floor(rand() * 30);
  }

  // Pick a style variant
  const variant = Math.floor(rand() * 4);

  if (variant === 0) {
    // Diagonal gradient with two tones
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, `hsl(${hue} ${sat}% 28%)`);
    grad.addColorStop(1, `hsl(${(hue + 30) % 360} ${sat}% 18%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle arc
    ctx.strokeStyle = `hsla(${hue} ${sat}% 60% / 0.12)`;
    ctx.lineWidth = size * 0.15;
    ctx.beginPath();
    const cx = rand() * size * 0.6 + size * 0.2;
    const cy = rand() * size * 0.6 + size * 0.2;
    ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 1.5);
    ctx.stroke();
  } else if (variant === 1) {
    // Radial gradient
    const grad = ctx.createRadialGradient(
      size * 0.3, size * 0.3, 0,
      size * 0.5, size * 0.5, size * 0.8
    );
    grad.addColorStop(0, `hsl(${hue} ${sat}% 32%)`);
    grad.addColorStop(1, `hsl(${(hue + 20) % 360} ${sat}% 16%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle line accent
    ctx.strokeStyle = `hsla(${hue} ${sat}% 55% / 0.15)`;
    ctx.lineWidth = 2;
    const y1 = size * (0.3 + rand() * 0.4);
    ctx.beginPath();
    ctx.moveTo(0, y1);
    ctx.lineTo(size, y1 + size * (rand() * 0.3 - 0.15));
    ctx.stroke();
  } else if (variant === 2) {
    // Mesh gradient (two overlapping radials)
    const bg = `hsl(${hue} ${sat}% 20%)`;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const g1 = ctx.createRadialGradient(
      size * 0.2, size * 0.8, 0,
      size * 0.2, size * 0.8, size * 0.7
    );
    g1.addColorStop(0, `hsla(${(hue + 40) % 360} ${sat}% 40% / 0.6)`);
    g1.addColorStop(1, `hsla(${(hue + 40) % 360} ${sat}% 40% / 0)`);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, size, size);

    const g2 = ctx.createRadialGradient(
      size * 0.8, size * 0.2, 0,
      size * 0.8, size * 0.2, size * 0.6
    );
    g2.addColorStop(0, `hsla(${(hue - 20 + 360) % 360} ${sat}% 35% / 0.5)`);
    g2.addColorStop(1, `hsla(${(hue - 20 + 360) % 360} ${sat}% 35% / 0)`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Angled split
    const grad = ctx.createLinearGradient(0, size, size, 0);
    grad.addColorStop(0, `hsl(${hue} ${sat}% 22%)`);
    grad.addColorStop(0.5, `hsl(${(hue + 15) % 360} ${sat}% 28%)`);
    grad.addColorStop(1, `hsl(${(hue + 35) % 360} ${sat}% 18%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Geometric accent — corner triangle
    ctx.fillStyle = `hsla(${hue} ${sat}% 50% / 0.08)`;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(size, size * 0.6);
    ctx.lineTo(size * 0.4, 0);
    ctx.closePath();
    ctx.fill();
  }

  return canvas.toDataURL("image/png");
}

export function CompanyPatternIcon({
  companyName,
  logoUrl,
  brandColor,
  className,
}: CompanyPatternIconProps) {
  const initial = companyName.trim().charAt(0).toUpperCase() || "?";
  const [imageError, setImageError] = useState(false);
  const logo = !imageError && typeof logoUrl === "string" && logoUrl.trim().length > 0 ? logoUrl : null;
  useEffect(() => {
    setImageError(false);
  }, [logoUrl]);
  const patternDataUrl = useMemo(
    () => makeCompanyGradientDataUrl(companyName.trim().toLowerCase(), brandColor),
    [companyName, brandColor],
  );

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-11 h-11 text-base font-semibold text-white overflow-hidden",
        className,
      )}
    >
      {logo ? (
        <img
          src={logo}
          alt={`${companyName} logo`}
          onError={() => setImageError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : patternDataUrl ? (
        <img
          src={patternDataUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      {!logo && (
        <span className="relative z-10 text-white/90 font-medium text-[15px] tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
          {initial}
        </span>
      )}
    </div>
  );
}
