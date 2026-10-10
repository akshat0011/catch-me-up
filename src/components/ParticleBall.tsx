import { useEffect, useRef } from "react";

interface Pt {
  x: number;
  y: number;
  z: number;
  seam: boolean;
  phase: number;
}

/** Points on a unit sphere (Fibonacci lattice) plus a stitched equatorial seam: a cricket ball, drawn as particles. */
function buildPoints(): Pt[] {
  const pts: Pt[] = [];
  const N = 2600;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    pts.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r, seam: false, phase: Math.random() * Math.PI * 2 });
  }
  // Seam: two parallel rows of stitches around the equator.
  for (const lat of [-0.055, 0.055]) {
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * Math.PI * 2;
      const r = Math.cos(lat);
      for (const d of [0, 0.012]) {
        pts.push({ x: Math.cos(a + d) * r, y: Math.sin(lat) + (lat > 0 ? d : -d), z: Math.sin(a + d) * r, seam: true, phase: 0 });
      }
    }
  }
  return pts;
}

export function ParticleBall({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = buildPoints();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tilt = 0.42; // radians, so the seam reads as an ellipse
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    let raf = 0;
    let visible = true;
    let angle = 0.6;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    const draw = (time: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const R = Math.min(w, h) * 0.42;
      const cx = w / 2;
      const cy = h / 2;
      const dot = Math.max(1.2, w / 460);
      ctx.clearRect(0, 0, w, h);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      for (const p of pts) {
        // rotate around Y, then tilt around X
        const x1 = p.x * cosA + p.z * sinA;
        const z1 = -p.x * sinA + p.z * cosA;
        const y2 = p.y * cosT - z1 * sinT;
        const z2 = p.y * sinT + z1 * cosT;
        const breathe = p.seam ? 1 : 1 + 0.018 * Math.sin(time / 900 + p.phase);
        const depth = (z2 + 1) / 2; // 0 back, 1 front
        const alpha = p.seam ? 0.1 + depth * 0.85 : 0.05 + depth * depth * 0.62;
        if (alpha < 0.05) continue;
        ctx.fillStyle = `rgba(250,250,250,${alpha.toFixed(3)})`;
        const s = (p.seam ? dot * 1.25 : dot) * (0.6 + depth * 0.6);
        ctx.fillRect(cx + x1 * R * breathe - s / 2, cy + y2 * R * breathe - s / 2, s, s);
      }
    };

    const loop = (time: number) => {
      const dt = Math.min(64, time - last);
      last = time;
      angle += dt * 0.00012;
      draw(time);
      if (visible) raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduce) {
      draw(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !reduce) {
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
