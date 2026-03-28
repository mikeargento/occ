"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number;
  ox: number; oy: number; // origin for reset
}

let warpMode = false;

export function triggerWarp(active: boolean) {
  warpMode = active;
}

export function ParticleBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];
    const PARTICLE_COUNT = 80;
    const CONNECT_DIST = 160;
    const MOUSE = { x: -1000, y: -1000 };
    let warpSpeed = 0; // 0 = normal, 1 = full warp

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    function init() {
      resize();
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = Math.random() * canvas!.width;
        const y = Math.random() * canvas!.height;
        particles.push({
          x, y, z: Math.random() * 1000,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          vz: 0,
          r: Math.random() * 2 + 0.8,
          ox: x, oy: y,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      // Smooth warp transition
      const targetWarp = warpMode ? 1 : 0;
      warpSpeed += (targetWarp - warpSpeed) * 0.08;

      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2;

      for (const p of particles) {
        if (warpSpeed > 0.01) {
          // Warp: particles fly toward camera (z decreases)
          p.vz = -8 - warpSpeed * 25;
          p.z += p.vz;

          // Reset particles that pass the camera
          if (p.z < 1) {
            p.z = 1000;
            p.x = Math.random() * canvas!.width;
            p.y = Math.random() * canvas!.height;
          }
        } else {
          p.vz *= 0.95;
          p.z += p.vz;
          if (p.z < 100) p.z = 100 + Math.random() * 900;
        }

        // Normal drift
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas!.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1;
      }

      // Perspective projection
      const projected = particles.map(p => {
        const scale = 600 / (p.z + 100);
        const sx = cx + (p.x - cx) * scale;
        const sy = cy + (p.y - cy) * scale;
        const sr = p.r * scale;
        const alpha = Math.min(1, scale * 0.8);
        return { sx, sy, sr, alpha, p };
      });

      // Draw connections (skip in heavy warp)
      if (warpSpeed < 0.5) {
        for (let i = 0; i < projected.length; i++) {
          for (let j = i + 1; j < projected.length; j++) {
            const dx = projected[i].sx - projected[j].sx;
            const dy = projected[i].sy - projected[j].sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < CONNECT_DIST) {
              const alpha = (1 - dist / CONNECT_DIST) * 0.25 * Math.min(projected[i].alpha, projected[j].alpha);
              ctx!.beginPath();
              ctx!.moveTo(projected[i].sx, projected[i].sy);
              ctx!.lineTo(projected[j].sx, projected[j].sy);
              ctx!.strokeStyle = `rgba(10, 132, 255, ${alpha})`;
              ctx!.lineWidth = 0.6;
              ctx!.stroke();
            }
          }

          // Mouse connection
          const mdx = projected[i].sx - MOUSE.x;
          const mdy = projected[i].sy - MOUSE.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist < 200) {
            const alpha = (1 - mdist / 200) * 0.4;
            ctx!.beginPath();
            ctx!.moveTo(projected[i].sx, projected[i].sy);
            ctx!.lineTo(MOUSE.x, MOUSE.y);
            ctx!.strokeStyle = `rgba(10, 132, 255, ${alpha})`;
            ctx!.lineWidth = 0.6;
            ctx!.stroke();
          }
        }
      }

      // Draw particles (with streaks in warp)
      for (const { sx, sy, sr, alpha, p } of projected) {
        if (sx < -50 || sx > canvas!.width + 50 || sy < -50 || sy > canvas!.height + 50) continue;

        if (warpSpeed > 0.05) {
          // Warp streaks — lines radiating from center
          const streakLen = warpSpeed * 30 * (600 / (p.z + 100));
          const dx = sx - cx;
          const dy = sy - cy;
          const angle = Math.atan2(dy, dx);
          const endX = sx + Math.cos(angle) * streakLen;
          const endY = sy + Math.sin(angle) * streakLen;

          ctx!.beginPath();
          ctx!.moveTo(sx, sy);
          ctx!.lineTo(endX, endY);
          ctx!.strokeStyle = `rgba(10, 132, 255, ${alpha * 0.8})`;
          ctx!.lineWidth = sr * 0.8;
          ctx!.stroke();
        }

        ctx!.beginPath();
        ctx!.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(10, 132, 255, ${alpha * 0.6})`;
        ctx!.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    function handleMouse(e: MouseEvent) {
      MOUSE.x = e.clientX;
      MOUSE.y = e.clientY;
    }

    function handleMouseLeave() {
      MOUSE.x = -1000;
      MOUSE.y = -1000;
    }

    init();
    draw();

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouse);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
