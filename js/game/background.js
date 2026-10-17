// Псевдо-3D фон комнаты: темы THEMES, buildTheme, drawBackground, drawForeground.
'use strict';

// ---------------------------------------------------------------- псевдо-3D фон
// Геометрия комнаты в координатах фона 640×1080
const BG = { w: 640, h: 1080, vx: 320, vy: 430, px: 0, py: 0, tx: 0, ty: 0, themes: {} };
const BX0 = 205, BX1 = 435, BY0 = 245, BY1 = 610;
const THEMES = {
  dungeon: { ceil: ['#060509', '#17131d'], floor: ['#1e1920', '#3a3036'], wall: ['#2b2431', '#16121b'], back: ['#1a1520', '#261f2a'], torch: [255, 170, 80], moss: false },
  jungle:  { ceil: ['#050806', '#121a12'], floor: ['#18201a', '#2f3a2c'], wall: ['#223024', '#121a14'], back: ['#16201a', '#1f2c22'], torch: [190, 230, 120], moss: true },
  spirit:  { ceil: ['#04050c', '#10142a'], floor: ['#161a2c', '#2a2f4a'], wall: ['#1e2340', '#0f1224'], back: ['#151a32', '#1d2342'], torch: [110, 190, 255], spirit: true }
};
function poly(g, pts, fill) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath(); g.fillStyle = fill; g.fill();
}
function lin(g, x0, y0, x1, y1, a, b) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, a); gr.addColorStop(1, b);
  return gr;
}
function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }

function buildTheme(name) {
  const T = THEMES[name];
  const bw = BG.w, bh = BG.h, vx = BG.vx, vy = BG.vy;
  const c = document.createElement('canvas'); c.width = bw; c.height = bh;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0a10'; g.fillRect(0, 0, bw, bh);
  poly(g, [[0, 0], [bw, 0], [BX1, BY0], [BX0, BY0]], lin(g, 0, 0, 0, BY0, T.ceil[0], T.ceil[1]));
  poly(g, [[BX0, BY1], [BX1, BY1], [bw, bh], [0, bh]], lin(g, 0, BY1, 0, bh, T.floor[0], T.floor[1]));
  poly(g, [[0, 0], [BX0, BY0], [BX0, BY1], [0, bh]], lin(g, 0, 0, BX0, 0, T.wall[0], T.wall[1]));
  poly(g, [[bw, 0], [BX1, BY0], [BX1, BY1], [bw, bh]], lin(g, bw, 0, BX1, 0, T.wall[0], T.wall[1]));
  g.fillStyle = lin(g, 0, BY0, 0, BY1, T.back[0], T.back[1]);
  g.fillRect(BX0, BY0, BX1 - BX0, BY1 - BY0);

  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
  for (let y = BY0 + 20, row = 0; y < BY1; y += 23, row++) {
    line(g, BX0, y, BX1, y);
    for (let x = BX0 + (row % 2 ? 0 : 22); x < BX1; x += 44) line(g, x, y - 23, x, y);
  }
  g.strokeStyle = 'rgba(0,0,0,.42)';
  for (let y = BY0 + 20; y < BY1; y += 23) {
    line(g, BX0, y, 0, vy + vx / (vx - BX0) * (y - vy));
    line(g, BX1, y, bw, vy + (bw - vx) / (BX1 - vx) * (y - vy));
  }
  for (let k = 1; k < 7; k++) {
    const f = 1 - 1 / (1 + k * 0.45);
    const xl = BX0 * f, xr = bw - (bw - BX1) * f;
    line(g, xl, BY0 * xl / BX0, xl, bh + (BY1 - bh) * xl / BX0);
    line(g, xr, BY0 * (bw - xr) / (bw - BX1), xr, bh + (BY1 - bh) * (bw - xr) / (bw - BX1));
  }
  g.save();
  g.beginPath(); g.moveTo(BX0, BY1); g.lineTo(BX1, BY1); g.lineTo(bw, bh); g.lineTo(0, bh); g.closePath(); g.clip();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2;
  for (let k = 1; k <= 9; k++) { const y = BY1 + (bh - BY1) * Math.pow(k / 9, 1.7); line(g, 0, y, bw, y); }
  for (let x = -400; x <= bw + 400; x += 70) line(g, vx, vy, x, bh);
  g.restore();

  if (T.spirit) {
    // кухня-святилище: полка с котелком, бумажные талисманы, призрачные огоньки
    g.fillStyle = '#0b0d1c';
    g.fillRect(250, 470, 140, 140);
    g.fillStyle = '#2b2f4a'; g.fillRect(240, 462, 160, 12);
    g.fillStyle = '#121527';
    g.beginPath(); g.ellipse(320, 540, 46, 34, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a4066'; g.lineWidth = 3; g.beginPath(); g.ellipse(320, 512, 46, 10, 0, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 14; i++) {
      const left = i % 2 === 0;
      const x = left ? rand(20, BX0 - 30) : rand(BX1 + 30, bw - 20), y = rand(60, 420);
      g.save(); g.translate(x, y); g.rotate(rand(-0.15, 0.15));
      g.fillStyle = 'rgba(230,220,190,.75)'; g.fillRect(-9, 0, 18, 46);
      g.strokeStyle = 'rgba(160,40,40,.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-4, 8); g.lineTo(4, 14); g.lineTo(-4, 22); g.lineTo(4, 30); g.stroke();
      g.strokeStyle = 'rgba(200,190,160,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -30); g.stroke();
      g.restore();
    }
    for (let i = 0; i < 26; i++) {
      const x = rand(0, bw), y = rand(40, BY1), r = rand(4, 12);
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
      gr.addColorStop(0, 'rgba(140,210,255,.55)'); gr.addColorStop(1, 'rgba(140,210,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
    }
  } else if (!T.moss) {
    // решётка темницы на задней стене
    const dx0 = 285, dx1 = 355, dy0 = 455;
    g.fillStyle = '#07060a';
    g.beginPath(); g.moveTo(dx0, BY1); g.lineTo(dx0, dy0 + 20); g.quadraticCurveTo((dx0 + dx1) / 2, dy0 - 18, dx1, dy0 + 20); g.lineTo(dx1, BY1); g.closePath(); g.fill();
    g.strokeStyle = '#3d3540'; g.lineWidth = 3;
    for (let x = dx0 + 10; x < dx1; x += 12) line(g, x, dy0 + 6, x, BY1);
    line(g, dx0, dy0 + 60, dx1, dy0 + 60);
    g.strokeStyle = 'rgba(120,110,120,.55)'; g.lineWidth = 2;
    for (const [cx, cy] of [[90, 300], [550, 300]]) {
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(cx, cy + i * 14, 4, 7, 0, 0, Math.PI * 2); g.stroke(); }
    }
  } else {
    // мох и лианы зелёного яруса
    for (let i = 0; i < 46; i++) {
      const left = i % 2 === 0;
      const x0 = left ? rand(0, BX0 - 10) : rand(BX1 + 10, bw);
      let x = x0, y = rand(-20, 200);
      g.strokeStyle = `rgba(${randi(40, 80)},${randi(110, 160)},${randi(50, 80)},${rand(0.5, 0.85)})`;
      g.lineWidth = rand(2, 5);
      g.beginPath(); g.moveTo(x, y);
      const len = rand(200, 600);
      for (let s = 0; s < len; s += 20) { x += rand(-6, 6); y += 20; g.lineTo(x, y); }
      g.stroke();
      g.fillStyle = 'rgba(90,170,80,.75)';
      for (let s = 0; s < 6; s++) { g.beginPath(); g.ellipse(x0 + rand(-10, 10), rand(40, 600), 7, 3.5, rand(0, 3), 0, Math.PI * 2); g.fill(); }
    }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${randi(40, 70)},${randi(90, 130)},${randi(40, 60)},${rand(0.25, 0.5)})`;
      g.beginPath(); g.ellipse(rand(0, bw), rand(BY1 + 20, bh), rand(10, 40), rand(4, 10), 0, 0, Math.PI * 2); g.fill();
    }
    const ray = g.createLinearGradient(320, 0, 320, BY1);
    ray.addColorStop(0, 'rgba(190,255,170,.16)'); ray.addColorStop(1, 'rgba(190,255,170,0)');
    g.fillStyle = ray;
    g.beginPath(); g.moveTo(280, 0); g.lineTo(360, 0); g.lineTo(420, BY1); g.lineTo(220, BY1); g.closePath(); g.fill();
  }

  const f = document.createElement('canvas'); f.width = bw; f.height = bh;
  const h = f.getContext('2d');
  for (const [x0, x1] of [[0, 54], [bw - 54, bw]]) {
    h.fillStyle = lin(h, x0, 0, x1, 0, x0 === 0 ? '#0b090e' : '#2c2530', x0 === 0 ? '#2c2530' : '#0b090e');
    h.fillRect(x0, 0, x1 - x0, bh);
    h.strokeStyle = 'rgba(0,0,0,.5)'; h.lineWidth = 2;
    for (let y = 30; y < bh; y += 46) line(h, x0, y, x1, y);
    if (T.moss) {
      h.strokeStyle = 'rgba(70,140,70,.8)'; h.lineWidth = 4;
      h.beginPath(); h.moveTo((x0 + x1) / 2, 0);
      for (let y = 0; y < 700; y += 30) h.lineTo((x0 + x1) / 2 + Math.sin(y * 0.05) * 14, y);
      h.stroke();
    }
  }
  BG.themes[name] = { back: c, front: f, torch: T.torch };
}

const bgX = (x) => (W - BG.w) / 2 - BG.px * 14 + x;
const bgY = (y) => (H - BG.h) / 2 + 20 - BG.py * 10 + y;

function drawBackground(theme, t) {
  const th = BG.themes[theme] || BG.themes.dungeon;
  BG.px = lerp(BG.px, BG.tx + Math.sin(t * 0.35) * 0.15, 0.05);
  BG.py = lerp(BG.py, BG.ty + Math.cos(t * 0.27) * 0.1, 0.05);
  ctx.drawImage(th.back, bgX(0), bgY(0));
  const [r, gg, b] = th.torch;
  for (const tx of [118, 522]) {
    const x = bgX(tx), y = bgY(470);
    const fl = 0.85 + Math.sin(t * 13 + tx) * 0.07 + Math.sin(t * 7.3 + tx * 2) * 0.08;
    const gr = ctx.createRadialGradient(x, y, 4, x, y, 210 * fl);
    gr.addColorStop(0, `rgba(${r},${gg},${b},.42)`);
    gr.addColorStop(0.35, `rgba(${r},${Math.round(gg * 0.7)},${Math.round(b * 0.6)},.14)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gr; ctx.fillRect(x - 220, y - 220, 440, 440);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#3b2b22'; ctx.fillRect(x - 4, y, 8, 34);
    ctx.fillStyle = `rgb(${r},${Math.min(255, gg + 50)},${Math.min(255, b + 40)})`;
    ctx.beginPath(); ctx.ellipse(x, y - 6, 6 * fl, 14 * fl, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3d0';
    ctx.beginPath(); ctx.ellipse(x, y - 3, 3, 7 * fl, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function drawForeground(theme) {
  const th = BG.themes[theme] || BG.themes.dungeon;
  ctx.drawImage(th.front, (W - BG.w) / 2 - BG.px * 34, (H - BG.h) / 2 + 20 - BG.py * 18);
  const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
