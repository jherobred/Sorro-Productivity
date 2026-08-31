'use client';

import { Haptics, ImpactStyle } from '@capacitor/haptics';

export type FireworkOrigin = { x: number; y: number };

export interface FireworksOptions {
  count?: number;
  spread?: number;
  colors?: string[];
  launchDuration?: number;
}

const CELEBRATION_COLORS = [
  '#7C6CFF', // Neon Violet
  '#00E5FF', // Electric Cyan
  '#00FF9D', // Mint Neon
  '#FFB800', // Gold Amber
  '#FF3366', // Hot Coral
  '#FF5252', // Radiant Red
  '#E040FB', // Purple Neon
  '#FFFFFF', // Starlight White
];

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
  friction: number;
  flicker: boolean;
  trail: { x: number; y: number; alpha: number }[];

  constructor(x: number, y: number, color: string, speedMult: number = 1) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 6 + 2) * speedMult;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = Math.random() * 2.5 + 1.5;
    this.color = color;
    this.alpha = 1;
    this.decay = Math.random() * 0.015 + 0.012;
    this.gravity = 0.12;
    this.friction = 0.96;
    this.flicker = Math.random() > 0.5;
    this.trail = [];
  }

  update(): boolean {
    this.trail.push({ x: this.x, y: this.y, alpha: this.alpha });
    if (this.trail.length > 5) this.trail.shift();

    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += this.gravity;

    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;

    return this.alpha > 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw trail
    for (let i = 0; i < this.trail.length; i++) {
      const point = this.trail[i];
      const trailAlpha = point.alpha * (i / this.trail.length) * 0.4;
      ctx.beginPath();
      ctx.arc(point.x, point.y, this.size * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = Math.max(0, trailAlpha);
      ctx.fill();
    }

    // Draw main spark
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    const renderAlpha = this.flicker ? this.alpha * (0.6 + 0.4 * Math.sin(Date.now() * 0.03)) : this.alpha;
    ctx.globalAlpha = Math.max(0, renderAlpha);
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

class Rocket {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  trail: { x: number; y: number }[];
  exploded: boolean;

  constructor(startX: number, startY: number, targetX: number, targetY: number, color: string) {
    this.x = startX;
    this.y = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.color = color;
    this.alpha = 1;
    this.trail = [];
    this.exploded = false;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.hypot(dx, dy);
    const speed = 14;
    const totalFrames = Math.max(15, distance / speed);
    this.vx = dx / totalFrames;
    this.vy = dy / totalFrames;
  }

  update(): boolean {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 7) this.trail.shift();

    this.x += this.vx;
    this.y += this.vy;

    // Check if reached target
    if (this.vy < 0 ? this.y <= this.targetY : this.y >= this.targetY) {
      this.exploded = true;
      return false;
    }
    return true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fillStyle = '#FFAA00';
      ctx.globalAlpha = (i / this.trail.length) * 0.7;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#FFAA00';
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

class FireworksEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private rockets: Rocket[] = [];
  private animId: number | null = null;

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', this.handleResize);
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
    if (this.animId) cancelAnimationFrame(this.animId);
    this.particles = [];
    this.rockets = [];
  }

  private handleResize = () => {
    this.resize();
  };

  private resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
  }

  burst(x: number, y: number, color?: string, count: number = 45) {
    const burstColor = color || CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];
    for (let i = 0; i < count; i++) {
      const pColor = Math.random() > 0.3 ? burstColor : CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];
      this.particles.push(new Particle(x, y, pColor, 1));
    }
    // Extra glittering flash
    for (let i = 0; i < 15; i++) {
      this.particles.push(new Particle(x, y, '#FFFFFF', 1.4));
    }
    this.startLoop();
  }

  launch(targetX: number, targetY: number) {
    const startX = targetX + (Math.random() - 0.5) * 80;
    const startY = window.innerHeight + 10;
    const color = CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];
    this.rockets.push(new Rocket(startX, startY, targetX, targetY, color));
    this.startLoop();
  }

  celebrate(originX?: number, originY?: number) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Trigger haptic feedback if available
    try {
      void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    } catch {
      // Ignore if not supported
    }

    const cx = originX ?? (width * (0.35 + Math.random() * 0.3));
    const cy = originY ?? (height * (0.25 + Math.random() * 0.2));

    // Instant joyful burst right at origin
    this.burst(cx, cy, undefined, 50);

    // Staggered celebration fireworks across top sky
    setTimeout(() => {
      this.launch(Math.max(60, cx - 120 + Math.random() * 60), cy - 40 + (Math.random() - 0.5) * 60);
    }, 100);

    setTimeout(() => {
      this.launch(Math.min(width - 60, cx + 120 + Math.random() * 60), cy - 60 + (Math.random() - 0.5) * 60);
    }, 240);

    setTimeout(() => {
      this.launch(width * (0.2 + Math.random() * 0.6), height * (0.2 + Math.random() * 0.25));
    }, 420);
  }

  private startLoop() {
    if (this.animId) return;
    const loop = () => {
      if (!this.ctx || !this.canvas) {
        this.animId = null;
        return;
      }

      this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Update and draw rockets
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const rocket = this.rockets[i];
        const alive = rocket.update();
        if (alive) {
          rocket.draw(this.ctx);
        } else {
          if (rocket.exploded) {
            this.burst(rocket.x, rocket.y, rocket.color, 40);
          }
          this.rockets.splice(i, 1);
        }
      }

      // Update and draw particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const particle = this.particles[i];
        const alive = particle.update();
        if (alive) {
          particle.draw(this.ctx);
        } else {
          this.particles.splice(i, 1);
        }
      }

      this.ctx.globalAlpha = 1;

      if (this.particles.length > 0 || this.rockets.length > 0) {
        this.animId = requestAnimationFrame(loop);
      } else {
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this.animId = null;
      }
    };

    this.animId = requestAnimationFrame(loop);
  }
}

export const fireworks = new FireworksEngine();

/**
 * Global trigger for celebratory task completion fireworks.
 */
export function triggerFireworks(x?: number, y?: number) {
  if (typeof window === 'undefined') return;
  fireworks.celebrate(x, y);
}
