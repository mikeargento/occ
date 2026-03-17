"use client";

import { useEffect, useRef, useState } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    // Use requestAnimationFrame to ensure DOM is ready after hydration
    const raf = requestAnimationFrame(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(el);
          }
        },
        { threshold: 0.05, rootMargin: "0px 0px -20px 0px" }
      );

      observer.observe(el);

      // Store cleanup ref
      (el as unknown as Record<string, IntersectionObserver>).__srObserver = observer;
    });

    return () => {
      cancelAnimationFrame(raf);
      const obs = (el as unknown as Record<string, IntersectionObserver>).__srObserver;
      if (obs) obs.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`${visible ? "sr-visible" : "sr-hidden"} ${className}`}
      style={visible && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
