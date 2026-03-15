"use client";

import { useEffect, useRef, useCallback } from "react";

const DOT_SPACING = 28;
const DOT_BASE_RADIUS = 1.2;
const DOT_MAX_RADIUS = 3;
const HOVER_RADIUS = 160;
const BASE_ALPHA = 0.12;
const MAX_ALPHA = 0.7;
const GLOW_COLOR = [16, 185, 129]; // emerald-500

// Random sparkle dots that pulse independently
const SPARKLE_CHANCE = 0.015; // ~1.5% of dots sparkle
const SPARKLE_ALPHA = 0.4;

interface Dot {
  x: number;
  y: number;
  alpha: number;
  radius: number;
  sparkle: boolean;
  sparklePhase: number;
  sparkleSpeed: number;
}

export function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);
  const dotsRef = useRef<Dot[]>([]);

  const initDots = useCallback((width: number, height: number, dpr: number) => {
    const w = width / dpr;
    const h = height / dpr;
    const cols = Math.ceil(w / DOT_SPACING) + 1;
    const rows = Math.ceil(h / DOT_SPACING) + 1;
    const dots: Dot[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isSparkle = Math.random() < SPARKLE_CHANCE;
        dots.push({
          x: c * DOT_SPACING,
          y: r * DOT_SPACING,
          alpha: BASE_ALPHA,
          radius: DOT_BASE_RADIUS,
          sparkle: isSparkle,
          sparklePhase: Math.random() * Math.PI * 2,
          sparkleSpeed: 0.5 + Math.random() * 1.5,
        });
      }
    }
    dotsRef.current = dots;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initDots(canvas.width, canvas.height, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
    };

    const handleLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    // Listen on document so it works even when mouse is over text
    document.addEventListener("mousemove", handleMouse);
    canvas.addEventListener("mouseleave", handleLeave);

    let time = 0;

    const draw = () => {
      time += 0.016; // ~60fps
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const dots = dotsRef.current;

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];

        const dx = mx - dot.x;
        const dy = my - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let targetAlpha = BASE_ALPHA;
        let targetRadius = DOT_BASE_RADIUS;

        // Hover glow
        if (dist < HOVER_RADIUS) {
          const t = 1 - dist / HOVER_RADIUS;
          const ease = t * t * (3 - 2 * t); // smoothstep
          targetAlpha = BASE_ALPHA + (MAX_ALPHA - BASE_ALPHA) * ease;
          targetRadius = DOT_BASE_RADIUS + (DOT_MAX_RADIUS - DOT_BASE_RADIUS) * ease;
        }

        // Random sparkle pulse
        if (dot.sparkle && dist >= HOVER_RADIUS) {
          const pulse = Math.sin(time * dot.sparkleSpeed + dot.sparklePhase);
          const sparkleT = (pulse + 1) * 0.5; // 0-1
          targetAlpha = Math.max(targetAlpha, BASE_ALPHA + (SPARKLE_ALPHA - BASE_ALPHA) * sparkleT);
          targetRadius = Math.max(targetRadius, DOT_BASE_RADIUS + 0.8 * sparkleT);
        }

        // Lerp for smooth transitions
        dot.alpha += (targetAlpha - dot.alpha) * 0.12;
        dot.radius += (targetRadius - dot.radius) * 0.12;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${GLOW_COLOR[0]}, ${GLOW_COLOR[1]}, ${GLOW_COLOR[2]}, ${dot.alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("mousemove", handleMouse);
      canvas.removeEventListener("mouseleave", handleLeave);
    };
  }, [initDots]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
