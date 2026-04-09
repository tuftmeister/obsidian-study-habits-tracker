const COLORS = [
  "#7c3aed", "#a78bfa", "#34d399", "#f59e0b",
  "#ec4899", "#60a5fa", "#f97316", "#84cc16",
];
const PARTICLE_COUNT = 220;
const GRAVITY        = 0.32;
const DRAG           = 0.98;
const DURATION_MS    = 3500;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  w: number; h: number;
  color: string;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeParticle(W: number): Particle {
  return {
    x:     rand(0, W),
    // stagger start heights so they don't all arrive at once
    y:     rand(-200, -10),
    vx:    rand(-3, 3),
    vy:    rand(1, 6),
    rot:   rand(0, Math.PI * 2),
    rotV:  rand(-0.12, 0.12),
    w:     rand(8, 15),
    h:     rand(4, 9),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

export function launchConfetti(): void {
  const canvas  = document.createElement("canvas");
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;" +
    "pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);

  const ctx        = canvas.getContext("2d")!;
  const particles  = Array.from({ length: PARTICLE_COUNT }, () => makeParticle(canvas.width));
  const start      = performance.now();
  let   rafId: number;

  function draw(now: number): void {
    const elapsed = now - start;
    const alpha   = Math.max(0, 1 - elapsed / DURATION_MS);

    if (elapsed > DURATION_MS) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.rot += p.rotV;

      // skip particles that haven't entered the screen yet or already exited
      if (p.y > canvas.height + 20) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);
  setTimeout(() => { cancelAnimationFrame(rafId); canvas.remove(); }, DURATION_MS + 200);
}
