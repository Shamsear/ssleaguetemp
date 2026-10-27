'use client';

import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  r: number;
  d: number;
  color: string;
  tilt: number;
  tiltAngleIncremental: number;
  tiltAngle: number;
}

export default function ConfettiEffect({ duration = 5000 }: { duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const colors = [
      '#FFD700', // Gold
      '#FFA500', // Amber
      '#FF4500', // Orange Red
      '#38BDF8', // Sky Blue
      '#4ADE80', // Emerald Green
      '#E879F9', // Purple
      '#F43F5E', // Rose
    ];

    const particleCount = Math.min(100, Math.floor(width / 12));
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height - height,
        r: Math.random() * 6 + 3,
        d: Math.random() * particleCount + 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngleIncremental: Math.random() * 0.07 + 0.04,
        tiltAngle: 0,
      });
    }

    let animationFrameId: number;
    const startTime = Date.now();

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const elapsed = Date.now() - startTime;
      const opacity = Math.max(0, 1 - elapsed / duration);

      if (opacity <= 0) {
        return;
      }

      ctx.globalAlpha = opacity;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r);
        ctx.stroke();

        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 2 + p.r / 2) * 1.2;
        p.tilt = Math.sin(p.tiltAngle) * 12;

        if (p.y > height) {
          p.x = Math.random() * width;
          p.y = -20;
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [duration]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}
