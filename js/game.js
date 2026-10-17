// Проклятое подземелье — прототип v0.2. Чистый JavaScript + Canvas 2D, без фреймворков.
// Логическое разрешение 540×960 (вертикальный экран), масштабируется под окно.
'use strict';
(function () {
  const W = 540, H = 960;
  const D = window.GAME_DATA;
  const t = window.I18N.t;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const stageEl = $('#stage');

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Тайминги управления
  const TAP_MAX = 0.22;        // нажатие короче — это тап
  const SWIPE_DIST = 28;       // смещение больше — это росчерк
  const GUARD_R = 70;          // круг удара: сюда нажимать для защиты
  const GUARD_HIT = 88;        // радиус, в котором нажатие засчитывается
  const CHARGE_START = 0.6, CHARGE_FULL = 2.0, CHARGE_MAX = 2.5;
  const CHARGED = 1.75;        // множитель, с которого удар считается заряженным
  const CIRCLE_MIN_R = 45;      // круг захвата: минимальный радиус
  const CIRCLE_SWEEP = 5.2;     //   и сколько радиан нужно обойти вокруг центра (≈300°)
  const HUD_TOP = 112, HUD_BOTTOM = 742;
  const displayFont = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
  const bodyFont = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';

  // ---------------------------------------------------------------- локальный пакет спрайтов
  // packs/pack.js (вне git) может заменить спрайты и числа любой героини: window.GAME_PACK = { enemies: { id: {...} } }
  if (window.GAME_PACK && window.GAME_PACK.enemies) {
    for (const [id, over] of Object.entries(window.GAME_PACK.enemies)) {
      if (D.enemies[id]) Object.assign(D.enemies[id], over);
      else if (over.sprites) D.enemies[id] = over;
    }
  }

  // ---------------------------------------------------------------- экран
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / W, vh / H);
    const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
    stageEl.style.width = cssW + 'px';
    stageEl.style.height = cssH + 'px';
    stageEl.style.setProperty('--u', (cssW / W) + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- сохранение
  const SAVE_KEY = 'cursed_dungeon_proto_v1';
  function emptySquad() { return { attack: null, defense: null, support: null }; }
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.captured) { s.fights = s.fights || []; s.runs = s.runs || []; s.squad = s.squad || emptySquad(); return s; }
    } catch (e) { /* хранилище недоступно */ }
    return { captured: {}, fights: [], runs: [], muted: false, squad: emptySquad() };
  }
  let save = loadSave();
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- звук (синтез, без файлов)
  const sfx = (() => {
    let ac = null;
    let muted = !!save.muted;
    function ensure() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && ac.state === 'suspended') ac.resume();
    }
    function tone(freq, dur, type = 'square', vol = 0.08, slide = 0, delay = 0) {
      if (!ac || muted) return;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol = 0.1, hp = 800) {
      if (!ac || muted) return;
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ac.createBufferSource(); s.buffer = b;
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      const g = ac.createGain(); g.gain.value = vol;
      s.connect(f).connect(g).connect(ac.destination);
      s.start();
    }
    return {
      ensure,
      get muted() { return muted; },
      toggle() { muted = !muted; save.muted = muted; writeSave(); return muted; },
      hit(m) { tone(170 + m * 70, 0.08, 'square', 0.05, 0.5); noise(0.05, 0.05, 2200); },
      crit() { tone(560, 0.14, 'sawtooth', 0.06, 0.4); noise(0.09, 0.08, 1500); },
      slash() { noise(0.2, 0.12, 3000); tone(900, 0.16, 'sawtooth', 0.035, 0.3); },
      guard() { tone(520, 0.12, 'sine', 0.05, 1.5); },
      block() { tone(150, 0.12, 'triangle', 0.12, 0.8); noise(0.04, 0.05, 3000); },
      parry() { tone(1250, 0.28, 'triangle', 0.09, 1.4); tone(1880, 0.22, 'sine', 0.05, 1.2); },
      hurt() { tone(95, 0.22, 'sawtooth', 0.1, 0.5); noise(0.12, 0.08, 400); },
      armor() { noise(0.45, 0.18, 500); tone(320, 0.4, 'square', 0.06, 0.3); },
      pop() { tone(720, 0.1, 'sine', 0.05, 1.6); },
      link() { tone(620, 0.08, 'sine', 0.06, 2); tone(930, 0.18, 'sine', 0.05, 2, 0.06); },
      burst() { noise(0.3, 0.1, 300); tone(200, 0.2, 'sawtooth', 0.04, 0.5); },
      vine() { noise(0.15, 0.08, 1200); tone(260, 0.12, 'triangle', 0.05, 1.4); },
      tel() { tone(440, 0.06, 'square', 0.025); },
      fail() { tone(120, 0.09, 'square', 0.05); },
      door() { noise(0.5, 0.06, 200); tone(90, 0.5, 'sawtooth', 0.04, 0.7); },
      phase() { tone(196, 0.5, 'sawtooth', 0.06, 0.5); tone(147, 0.6, 'square', 0.04, 0.5, 0.1); noise(0.4, 0.08, 300); },
      level() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.06, 0, i * 0.07)); },
      capture() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', 0.07, 0, i * 0.09)); },
      win() { [392, 523, 659].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, 0, i * 0.11)); },
      lose() { [330, 262, 196].forEach((f, i) => tone(f, 0.32, 'sawtooth', 0.05, 0, i * 0.16)); }
    };
  })();

  // ---------------------------------------------------------------- ассеты
  const assets = {};
  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(t('err.load', { src })));
      i.src = src;
    });
  }
  function tinted(img, color) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  async function loadAssets() {
    const list = Object.entries(D.enemies);
    await Promise.all(list.map(async ([id, e]) => {
      const stages = [];
      for (const src of e.sprites) {
        const img = await loadImage(src);
        stages.push({ img, white: tinted(img, '#ffffff'), red: tinted(img, '#ff2a2a'), dark: tinted(img, '#0a0610'), w: img.naturalWidth, h: img.naturalHeight });
      }
      assets[id] = { stages };
    }));
  }

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

  // ---------------------------------------------------------------- состояние игры
  const G = { mode: 'loading', paused: false, panelOpen: false, time: 0, selected: 'miko', heroLvl: 1, enemyLvl: 1, count: 1, speed: 1 };
  // ускоренный режим для проверок: index.html?speed=4 — логика идёт в 4 раза быстрее
  try { G.speed = clamp(Math.round(Number(new URLSearchParams(location.search).get('speed')) || 1), 1, 16); } catch (e) { /* ignore */ }
  let fight = null;
  let run = null;
  const input = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, downT: 0, downReal: 0, path: [], swiping: false, guardPress: false, lastTapT: -9 };

  // Частей брони задаётся в данных (armor); иначе — на одну меньше, чем спрайтов
  function armorParts(ed, nSprites) { return ed.armor ? ed.armor : Math.max(1, nSprites - 1); }
  // Какой спрайт показывать при данном числе сломанных частей
  function spriteIndex(nSprites, broken, parts) { return nSprites <= 1 ? 0 : Math.min(nSprites - 1, Math.floor(broken * (nSprites - 1) / Math.max(1, parts))); }
  function spriteFor(ed, broken) { return ed.sprites[spriteIndex(ed.sprites.length, broken, armorParts(ed, ed.sprites.length))]; }
  function levelMod(attackerLvl, defenderLvl) { return Math.pow(D.levelDiffFactor, attackerLvl - defenderLvl); }
  function defaultMods() { return { dmgMul: 1, chargeSpeed: 1, parryBonus: 0, tapCostMul: 1, stamAdd: 0, regenMul: 1, slashMul: 1, blockMul: 1, hpAdd: 0, sphereSlow: 1 }; }

  // ---------------------------------------------------------------- отряд
  // Слоты D.squad: атакующая, защитная, поддержка. Бонус задаётся видом противницы (companion в data.js).
  const BONUS = {
    dmg: (m, v) => { m.dmgMul *= 1 + v; },
    charge: (m, v) => { m.chargeSpeed *= 1 + v; },
    slash: (m, v) => { m.slashMul *= 1 + v; },
    parry: (m, v) => { m.parryBonus += v; },
    block: (m, v) => { m.blockMul *= 1 - v; },
    hp: (m, v) => { m.hpAdd += v; },
    regen: (m, v) => { m.regenMul *= 1 + v; },
    spheres: (m, v) => { m.sphereSlow *= 1 + v; },
    stamina: (m, v) => { m.stamAdd += v; }
  };
  const ABSOLUTE = ['parry', 'hp', 'stamina'];      // value — число, а не доля
  function bonusText(b) { return t('bonus.' + b.bonus, { v: ABSOLUTE.includes(b.bonus) ? b.value : Math.round(b.value * 100) }); }
  // слоты, в которые может встать вид противницы
  function companionSlots(id) { const c = D.enemies[id] && D.enemies[id].companion; return c ? D.squad.filter((s) => c[s]) : []; }
  function slotBonus(id, slot) { const c = D.enemies[id] && D.enemies[id].companion; return c && c[slot]; }
  // кто сейчас в слоте (только пойманные и подходящие)
  function squadMember(slot) {
    const id = save.squad[slot];
    return id && save.captured[id] && slotBonus(id, slot) ? id : null;
  }
  function withSquad(mods) {
    const m = { ...defaultMods(), ...mods };
    for (const slot of D.squad) {
      const id = squadMember(slot);
      const b = id && slotBonus(id, slot);
      if (b && BONUS[b.bonus]) BONUS[b.bonus](m, b.value);
    }
    return m;
  }
  // Портрет спутницы: кадр вокруг головы. Голову ищем по силуэту первой стадии спрайта
  // (верх непрозрачной области, центр по горизонтали в полосе головы). Если чтение пикселей
  // недоступно (file:// в Chrome), берётся середина верха. Поправить вручную: portrait: { x, y, size }
  // у героини в data.js — доли ширины и высоты спрайта.
  const portraitCache = {};
  function portraitSpot(id) {
    if (portraitCache[id]) return portraitCache[id];
    const st = assets[id] && assets[id].stages[0], ed = D.enemies[id];
    if (!st) return null;
    let x = 0.5, y = 0.12, size = 0.21;
    try {
      const S = 4, mw = Math.ceil(st.w / S), mh = Math.ceil(st.h / S);
      const c = document.createElement('canvas'); c.width = mw; c.height = mh;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(st.img, 0, 0, mw, mh);
      const d = g.getImageData(0, 0, mw, mh).data, solid = (px, py) => d[(py * mw + px) * 4 + 3] > 100;
      let top = -1;
      for (let py = 0; py < mh && top < 0; py++) for (let px = 0; px < mw; px++) if (solid(px, py)) { top = py; break; }
      if (top >= 0) {
        let sx = 0, n = 0;
        for (let py = top + Math.round(mh * 0.04); py < Math.min(mh, top + Math.round(mh * 0.15)); py++) for (let px = 0; px < mw; px++) if (solid(px, py)) { sx += px; n++; }
        if (n) x = sx / n / mw;
        y = top / mh + 0.1;
      }
    } catch (e) { /* пиксели недоступны — остаётся середина верха */ }
    const o = ed.portrait || {};
    portraitCache[id] = { x: o.x != null ? o.x : x, y: o.y != null ? o.y : y, size: o.size || size };
    return portraitCache[id];
  }
  // прямоугольник кадра в пикселях спрайта для окна с соотношением сторон aspect (ширина/высота)
  function portraitRect(id, aspect) {
    const p = portraitSpot(id), st = assets[id].stages[0];
    const h = Math.min(st.h, p.size * st.h), w = Math.min(st.w, h * aspect);
    return { x: clamp(p.x * st.w - w / 2, 0, st.w - w), y: clamp(p.y * st.h - h / 2, 0, st.h - h), w, h, iw: st.w, ih: st.h };
  }
  // то же для HTML: фон-картинка с нужным масштабом и сдвигом
  function portraitStyle(id, aspect) {
    const r = portraitRect(id, aspect), D_ = D.enemies[id];
    const px = r.iw > r.w ? r.x / (r.iw - r.w) * 100 : 50, py = r.ih > r.h ? r.y / (r.ih - r.h) * 100 : 0;
    return `background-image:url('${D_.sprites[0]}');background-size:${(r.iw / r.w * 100).toFixed(1)}% auto;background-position:${px.toFixed(1)}% ${py.toFixed(1)}%`;
  }

  function setSquad(slot, id) {
    for (const s of D.squad) if (id && save.squad[s] === id) save.squad[s] = null;   // одна спутница — один слот
    save.squad[slot] = id;
    writeSave();
  }
  function xpNeed(lvl) { return D.xp.base + D.xp.perLvl * lvl; }

  function makeHero(lvl, rh) {
    const hd = D.hero;
    const mods = withSquad(rh ? rh.mods : defaultMods());
    // бонус здоровья от отряда — запас на один бой, сверх обычного здоровья
    const hpMax = (rh ? rh.hpMax : hd.hp + hd.hpPerLvl * (lvl - 1)) + mods.hpAdd;
    const stamMax = hd.stamina + mods.stamAdd;
    return {
      lvl, hpMax, hp: (rh ? rh.hp : hpMax - mods.hpAdd) + mods.hpAdd, stamMax, stam: stamMax,
      dmg: hd.dmg * (1 + hd.dmgPerLvl * (lvl - 1)) * mods.dmgMul,
      mods, relics: rh ? rh.relics : [],
      chargeT: 0, exhausted: false, lastStamUse: -9,
      burn: 0, burnDps: 0, burnTick: 0, shock: 0, chill: 0, entangled: 0,
      combo: 0, maxCombo: 0, hurtFlash: 0,
      seals: rh ? rh.seals : hd.seals, sealsMax: rh ? rh.sealsMax : hd.seals
    };
  }
  const hasRelic = (h, id) => h.relics.includes(id);
  function parryWindow(h) { return { pmin: D.hero.parryMin, pmax: D.hero.parryMax + h.mods.parryBonus }; }

  // ---------------------------------------------------------------- противницы в бою
  // Бой — это список противниц fight.foes. Впереди (slot 'front') одна: её бьют тапы, она атакует героя,
  // на неё указывают fight.enemy / fight.ed / fight.id / fight.layout. Задние ('left', 'right') помогают ей.
  function makeFoe(id, enemyLvl, mul) {
    const ed = D.enemies[id], st = assets[id].stages, s0 = st[0];
    const kind = ed.kind || 'normal', lv = enemyLvl - 1;
    const sc = Math.min((ed.height || 620) / s0.h, 500 / s0.w);
    const e = {
      lvl: enemyLvl, kind,
      hpMax: Math.round(ed.hp * (1 + 0.22 * lv) * mul.hp), hp: 0,
      stamMax: Math.round(ed.stamina * (1 + 0.32 * lv) * mul.hp), stam: 0,
      dmgScale: (1 + 0.18 * lv) * mul.dmg,
      atk: { ...ed.attack }, sph: { ...ed.spheres }, vinesCfg: null, phase: 0,
      stage: 0, parts: armorParts(ed, st.length), state: 'idle', st: 0,
      nextAttack: rand(1.4, 2.2), strikesLeft: 0, telDur: 0, regenStop: -9,
      nextSpheres: rand(3, 5), nextWeak: rand(3, 5), nextVine: rand(3, 5), lastStand: false,
      burn: 0, burnDps: 0, burnTick: 0,
      anim: { white: 0, lunge: 0, knock: 0, sx: 1, sy: 1 }
    };
    e.hp = e.hpMax;
    e.stam = e.stamMax;
    return {
      id, ed, enemy: e, slot: 'front', outcome: null, pos: null, target: null,
      base: { w: s0.w * sc, h: s0.h * sc, off: (ed.offsetX || 0) * sc },
      sup: { sphere: rand(4, 7), heal: rand(7, 11), step: rand(11, 17), stepT: 0 }
    };
  }

  function newFight(ids, heroLvl, enemyLvl, opts = {}) {
    ids = [].concat(ids);
    const mul = (ids.length > 1 && D.group && D.group[ids.length]) || { hp: 1, dmg: 1 };
    const foes = ids.map((id, i) => Object.assign(makeFoe(id, enemyLvl, mul), { slot: ['front', 'left', 'right'][i] }));
    const ed = foes[0].ed, kind = ed.kind || 'normal';
    const hero = makeHero(heroLvl, opts.runHero);
    fight = {
      foes, front: null, results: [], next: null, threads: [], cam: null, bgZoom: foes.length > 1 ? BG_GROUP_ZOOM : 1,
      id: null, ed: null, enemy: null, layout: null,
      t: 0, over: false, outcome: null, resultShown: false, overT: 0, endT: 0,
      inRun: !!opts.runHero, theme: ed.theme || (kind === 'boss' ? 'spirit' : 'dungeon'),
      hero,
      spheres: [], weak: null, vines: [], hazard: null, guardT: -9, guardPresses: [],
      fx: { texts: [], parts: [], shards: [], trails: [], links: [], shields: [] },
      shake: 0, hitStop: 0, tip: '', tipT: 0, banner: null,
      stats: { taps: 0, slashes: 0, parries: 0, blocks: 0, links: 0, breaks: 0, taken: 0, vines: 0, captureTries: 0, captures: 0 }
    };
    setFront(foes[0]);
    layoutFoes(true);
    hero.stamPower = levelMod(heroLvl, enemyLvl) * (1 + D.hero.dmgPerLvl * (heroLvl - 1)) * hero.mods.dmgMul;
    if (kind === 'boss' && ed.phases) applyPhase(fight.enemy, 0, false);
    if (foes.length > 1) {
      fight.banner = { title: foes.map((f) => f.ed.name).join(' · '), sub: t('fight.group', { n: foes.length }), t: 0, life: 2.2 };
      tip(t('tip.group'), 5);
    } else {
      const kindLabel = kind === 'boss' ? t('kind.boss') : kind === 'elite' ? t('kind.elite') : ed.subtitle;
      fight.banner = { title: ed.name, sub: kind === 'boss' ? ed.phases[0].title : kindLabel, t: 0, life: 1.8 };
    }
    resetInput();
  }

  // Передняя противница: все ссылки боя указывают на неё
  function setFront(foe) {
    const old = fight.front;
    if (old && old !== foe) old.slot = old.outcome ? 'gone' : foe.slot;
    foe.slot = 'front';
    foe.sup.stepT = 0;
    fight.front = foe; fight.enemy = foe.enemy; fight.ed = foe.ed; fight.id = foe.id;
    fight.hazard = HAZARDS[foe.ed.hazard] || HAZARDS.vines;
    fight.weak = null;
    layoutFoes(false);
  }
  const backFoes = () => fight.foes.filter((f) => f.slot !== 'front' && f.slot !== 'gone' && !f.outcome);

  // Расстановка в глубину: передняя крупно по центру, задние меньше, выше по полу, по краям
  // В группе передняя ближе к камере (крупный план, ноги уходят под нижнюю панель),
  // задние — за ней ближе к центру, дальше по полу; фон приближается (BG_GROUP_ZOOM), чтобы зал был шире
  const BG_GROUP_ZOOM = 1.42;
  function foeLayout(foe) {
    const backs = backFoes();
    let x = 0.5, s = 1, bottom = HUD_BOTTOM + 6;
    if (foe.slot === 'front') {
      if (backs.length) { s = 1.15; bottom += foe.base.h * s * 0.22; x = backs.length === 1 ? (backs[0].slot === 'left' ? 0.56 : 0.44) : 0.5; }
    } else {
      x = foe.slot === 'left' ? 0.245 : 0.755; s = 0.52;
      bottom = foe.slot === 'left' ? 606 : 616;            // чуть вразнобой — живее
    }
    const dw = foe.base.w * s, dh = foe.base.h * s;
    return { cx: W * x + foe.base.off * s, bottom, dw, dh, top: bottom - dh, chestY: bottom - dh * (foe.ed.chest || 0.62), s };
  }
  function layoutFoes(snap) {
    for (const f of fight.foes) {
      if (!f.outcome || !f.target) f.target = foeLayout(f);
      if (snap || !f.pos) f.pos = { cx: f.target.cx, bottom: f.target.bottom, s: f.target.s };
    }
    fight.layout = fight.front.target;
  }
  // где противница нарисована сейчас (позиции плавно догоняют расстановку)
  function posRect(foe) {
    const p = foe.pos, dw = foe.base.w * p.s, dh = foe.base.h * p.s;
    return { cx: p.cx, bottom: p.bottom, dw, dh, top: p.bottom - dh, chestY: p.bottom - dh * (foe.ed.chest || 0.62) };
  }
  function foeBox(foe) {
    const L = foe.target;
    return { x0: L.cx - L.dw * 0.3, x1: L.cx + L.dw * 0.3, y0: L.top + L.dh * 0.08, y1: L.bottom - 10 };
  }

  function applyPhase(e, idx, announce = true) {
    const ph = fight.ed.phases && fight.ed.phases[idx];
    if (!ph) return;
    e.phase = idx;
    if (ph.attack) Object.assign(e.atk, ph.attack);
    if (ph.spheres) Object.assign(e.sph, ph.spheres);
    if (ph.vines) { e.vinesCfg = ph.vines; e.nextVine = rand(2.5, 4); }
    fight.hazard = HAZARDS[fight.ed.hazard] || HAZARDS.vines;
    if (announce) {
      fight.banner = { title: ph.title, sub: ph.sub, t: 0, life: 2.6 };
      sfx.phase();
    }
  }

  function resetInput() {
    input.down = false; input.id = null; input.path = []; input.swiping = false; input.guardPress = false; input.lastTapT = -9;
  }

  // ---------------------------------------------------------------- эффекты
  function floatText(x, y, text, color = '#fff', size = 26, life = 0.9, vy = -60) {
    fight.fx.texts.push({ x, y, text, color, size, t: 0, life, vy });
  }
  function burst(x, y, n, colors, speed = 260, life = 0.6, size = 4, grav = 300) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(speed * 0.3, speed);
      fight.fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: rand(life * 0.6, life), color: pick(colors), size: rand(size * 0.6, size), grav });
    }
  }
  function shards(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), v = rand(180, 520);
      fight.fx.shards.push({ x: x + rand(-60, 60), y: y + rand(-80, 80), vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, 6), vr: rand(-12, 12), w: rand(10, 26), h: rand(6, 16), t: 0, life: rand(0.9, 1.4), color: pick(['#d9dde6', '#aeb4c2', '#f4f1ea', '#8c93a3', '#e9c27a']) });
    }
  }
  function tip(text, dur = 2.2) { fight.tip = text; fight.tipT = dur; }

  // ---------------------------------------------------------------- логика боя
  function chargeMult(h) {
    if (h.chargeT < CHARGE_START) return 1;
    return 1 + (CHARGE_MAX - 1) * clamp((h.chargeT - CHARGE_START) / (CHARGE_FULL - CHARGE_START), 0, 1);
  }
  function isLastStage(e) { return e.stage >= e.parts; }
  // Каждая сломанная часть брони — +25% урона; без брони урон ×2 (D.broken.dmgMul)
  function armorBonus(e) { return isLastStage(e) ? D.broken.dmgMul : 1 + 0.25 * e.stage; }
  // Шанс захвата: 70% при нулевой выносливости, 0% при полной
  function captureChance(e) { return D.broken.captureChance * (1 - clamp(e.stam / e.stamMax, 0, 1)); }
  function fighting() { return fight && !fight.over; }
  function enemyActive(e) { return e.state !== 'leaving'; }
  const tired = (e) => e.stam < e.stamMax * 0.3;

  function spendStamina(h, cost) {
    h.lastStamUse = fight.t;
    if (h.exhausted) return;
    h.stam -= cost * h.mods.tapCostMul;
    if (h.stam <= 0) {
      h.stam = 0; h.exhausted = true; h.combo = 0;
      floatText(W / 2, 700, t('fight.breath'), '#ff9a7a', 28);
      tip(t('tip.spam'));
    }
  }
  function enemyStamina(e, amount) {
    e.stam = Math.max(0, e.stam - amount);
  }
  function addCombo(h) { h.combo++; h.maxCombo = Math.max(h.maxCombo, h.combo); }

  function damageEnemy(dmg, x, y, color, big) {
    const e = fight.enemy;
    e.hp = Math.max(0, e.hp - dmg);
    floatText(x + rand(-14, 14), y, String(Math.round(dmg)), color, big ? 38 : 26, 0.8);
    if (e.hp <= 0) endByEnemyHp();
  }

  function heroTap(x, y) {
    if (!fighting()) return;
    const h = fight.hero, e = fight.enemy;
    input.lastTapT = fight.t;
    for (const s of fight.spheres) {
      if (dist(x, y, s.x, s.y) < s.r + 14) {
        s.taps++; s.r *= 0.86; s.hitFlash = 1;
        sfx.pop();
        if (s.taps >= 5) popSphere(s, false);
        return;
      }
    }
    if (!enemyActive(e)) return;
    if (h.shock > 0) {
      h.shock--; h.chargeT = 0;
      floatText(x, y - 20, t('fight.shockTap'), D.elements.electric.color, 22);
      burst(x, y, 10, ['#d9c8ff', '#b48cff'], 200, 0.4, 3, 0);
      sfx.fail();
      return;
    }
    spendStamina(h, D.hero.tapCost);
    let mult = chargeMult(h);
    h.chargeT = 0;
    const charged = mult >= CHARGED;
    let crit = false;
    if (fight.weak && dist(x, y, fight.weak.x, fight.weak.y) < 44) {
      crit = true; mult *= hasRelic(h, 'claw') ? 3 : 2;
      enemyStamina(e, 8 * h.stamPower);
      burst(fight.weak.x, fight.weak.y, 22, ['#ffe9a8', '#ffd060', '#fff'], 340, 0.6, 5, 200);
      fight.weak = null;
    }
    const ex = (h.exhausted ? 0.2 : 1) * (h.entangled > 0 ? 0.5 : 1);
    const dmg = h.dmg * levelMod(h.lvl, e.lvl) * mult * armorBonus(e) * ex * rand(0.92, 1.08);
    damageEnemy(dmg, x, y - 10, crit ? '#ffd060' : charged ? '#ffb36b' : '#ffffff', charged || crit);
    if (crit) floatText(x, y - 56, t('fight.crit'), '#ffd060', 30);
    enemyStamina(e, (1 + (charged ? 6 * (mult - 1) : 0)) * h.stamPower * ex);
    const a = e.anim;
    a.white = Math.max(a.white, charged ? 0.85 : 0.5);
    a.sx = 1.035; a.sy = 0.965; a.knock = charged ? 1 : 0.45;
    burst(x, y, charged ? 16 : 7, charged ? ['#ffd8a0', '#ffffff', '#ff9a50'] : ['#ffffff', '#f3e3c0'], charged ? 320 : 200, 0.4, 3.5, 200);
    if (charged) {
      fight.hitStop = 0.07; fight.shake = Math.max(fight.shake, 7);
      if (hasRelic(h, 'ember')) { e.burn = 3; e.burnDps = e.hpMax * 0.04 / 3; }
    }
    if (fight.over) return;
    if (charged) tryBreak(e);
    addCombo(h);
    fight.stats.taps++;
    crit ? sfx.crit() : sfx.hit(mult);
  }

  // Рассечение: по передней (hitFront) и/или по задним противницам, через которые прошёл росчерк
  function heroSlash(path, hitFront = true, backs = []) {
    if (!fighting()) return;
    const h = fight.hero, e = fight.enemy;
    const p0 = path[0], p1 = path[path.length - 1];
    hitFront = hitFront && enemyActive(e);
    if (!hitFront && !backs.length) return;
    fight.fx.trails.push({ pts: path.map((p) => ({ x: p.x, y: p.y })), t: 0, life: 0.35, color: '#ffffff', w: 10 });
    if (h.shock > 0) { h.shock--; h.chargeT = 0; floatText(p1.x, p1.y, t('fight.shockSlash'), D.elements.electric.color, 22); sfx.fail(); return; }
    spendStamina(h, D.hero.slashCost);
    let mult = chargeMult(h);
    h.chargeT = 0;
    const ex = (h.exhausted ? 0.2 : 1) * (h.entangled > 0 ? 0.5 : 1);
    fight.hitStop = 0.08; fight.shake = Math.max(fight.shake, 9);
    fight.fx.trails.push({ pts: path.map((p) => ({ x: p.x, y: p.y })), t: 0, life: 0.5, color: '#9fe3ff', w: 22 });
    for (const b of backs) slashBack(b, mult, ex);
    if (hitFront && !fight.over) {
      let crit = false;
      if (fight.weak && pathHitsCircle(path, fight.weak.x, fight.weak.y, 40)) { crit = true; mult *= hasRelic(h, 'claw') ? 3 : 2; enemyStamina(e, 8 * h.stamPower); fight.weak = null; }
      const dmg = h.dmg * 1.3 * h.mods.slashMul * levelMod(h.lvl, e.lvl) * mult * armorBonus(e) * ex * rand(0.92, 1.08);
      const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
      damageEnemy(dmg, mx, my - 20, crit ? '#ffd060' : '#9fe3ff', true);
      floatText(mx, my - 62, crit ? t('fight.slashCrit') : t('fight.slash'), '#bfefff', 24);
      enemyStamina(e, (6 + 7 * (mult - 1)) * h.stamPower * ex);
      const a = e.anim;
      a.white = 0.9; a.knock = 1; a.sx = 1.05; a.sy = 0.95;
      burst(mx, my, 18, ['#bfefff', '#ffffff', '#7fd8ff'], 360, 0.45, 4, 150);
      if (fight.over) return;
      tryBreak(e);
    }
    if (fight.over) return;
    addCombo(h);
    fight.stats.slashes++;
    sfx.slash();
  }

  // Росчерк задела задняя противница: урон и выносливость; выход вперёд сбивается
  function slashBack(foe, mult, ex) {
    const h = fight.hero, e = foe.enemy, L = foe.target;
    const dmg = h.dmg * 1.3 * h.mods.slashMul * levelMod(h.lvl, e.lvl) * mult * armorBonus(e) * ex * rand(0.92, 1.08);
    e.hp = Math.max(0, e.hp - dmg);
    e.stam = Math.max(0, e.stam - (6 + 7 * (mult - 1)) * h.stamPower * ex);
    e.anim.white = 0.9; e.anim.knock = 1;
    floatText(L.cx + rand(-10, 10), L.chestY, String(Math.round(dmg)), '#9fe3ff', 28, 0.8);
    burst(L.cx, L.chestY, 12, ['#bfefff', '#ffffff'], 260, 0.4, 3, 150);
    if (foe.sup.stepT > 0) {
      foe.sup.stepT = 0; foe.sup.step = rand(10, 15);
      e.stam = Math.max(0, e.stam - 10 * h.stamPower);
      floatText(L.cx, L.top + 8, t('fight.stepStopped'), '#ffe9a8', 22);
    }
    if (e.hp <= 0) backDone(foe);
  }

  // Задняя выходит вперёд: передняя отходит на её место, начатая атака отменяется
  function stepForward(foe) {
    const old = fight.front, oe = old.enemy;
    if (oe.state !== 'stun') { oe.state = 'idle'; oe.st = 0; }
    oe.strikesLeft = 0; oe.nextAttack = rand(1, 2);
    old.sup.step = rand(12, 18); old.sup.stepT = 0;
    setFront(foe);
    const e = foe.enemy;
    e.state = 'idle'; e.st = 0; e.nextAttack = rand(0.9, 1.4);
    floatText(fight.layout.cx, fight.layout.top + 40, t('fight.stepIn'), '#ffe9a8', 26, 1.1, -30);
    sfx.guard();
  }

  // Помощь задних: свои сферы, нить лечения к передней, выход вперёд
  function updateBacks(dt, rdt) {
    const front = fight.enemy;
    for (const foe of fight.foes) {
      if (foe === fight.front) continue;
      const e = foe.enemy, a = e.anim, s = foe.sup;
      a.white = Math.max(0, a.white - rdt * 4);
      a.knock = Math.max(0, a.knock - rdt * 5);
      a.lunge = Math.max(0, a.lunge - rdt * 3.2);
      a.sx = lerp(a.sx, 1, Math.min(1, rdt * 14)); a.sy = lerp(a.sy, 1, Math.min(1, rdt * 14));
      if (e.state === 'leaving') { e.st += rdt; continue; }
      if (foe.outcome || fight.over || fight.next || dt === 0 || !enemyActive(front)) continue;
      s.sphere -= dt;
      if (s.sphere <= 0) { spawnSpheres(e); s.sphere = rand(e.sph.every[0], e.sph.every[1]) * 1.3; }
      s.heal -= dt;
      if (s.heal <= 0) {
        s.heal = rand(9, 13);
        if (front.hp < front.hpMax * 0.97 && !fight.threads.some((th) => th.foe === foe)) fight.threads.push({ foe, t: 0, dur: 2.8 });
      }
      if (s.stepT > 0) {
        s.stepT -= dt;
        if (s.stepT <= 0) stepForward(foe);
      } else {
        s.step -= dt;
        if (s.step <= 0 && (front.state === 'idle' || front.state === 'recover')) { s.stepT = 1.6; sfx.tel(); }
      }
    }
    for (const th of [...fight.threads]) {
      if (fight.over || fight.next) break;
      th.t += dt;
      if (th.t < th.dur) continue;
      fight.threads = fight.threads.filter((x) => x !== th);
      const heal = Math.round(front.hpMax * 0.06);
      front.hp = Math.min(front.hpMax, front.hp + heal);
      floatText(fight.layout.cx, fight.layout.chestY - 20, '+' + heal, D.elements.nature.color, 30);
    }
  }
  // линия нити лечения: от груди задней к груди передней
  function threadLine(th) {
    const a = posRect(th.foe), b = posRect(fight.front);
    return [{ x: a.cx, y: a.chestY }, { x: b.cx, y: b.chestY }];
  }

  // Защита: нажатие в круг удара. В тайминг — парирование, палец в круге в момент удара — блок.
  function guardCenter() { const L = fight.layout; return { x: L.cx, y: L.chestY + 70 }; }
  function inGuardCircle(p) { const c = guardCenter(); return dist(p.x, p.y, c.x, c.y) <= GUARD_HIT; }
  function guardPress() {
    const h = fight.hero, c = guardCenter();
    if (h.entangled > 0) {
      floatText(c.x, c.y - GUARD_R - 14, fight.hazard.guardOff, fight.hazard.color, 22);
      sfx.fail();
      return;
    }
    fight.guardT = fight.t;
    fight.guardPresses.push(fight.t);
    fight.fx.shields.push({ x: c.x, y: c.y, r: GUARD_R, t: 0, life: 0.3, color: '#e9f2ff' });
    sfx.guard();
  }

  function tryBreak(e) {
    if (tired(e) && enemyActive(e) && !isLastStage(e)) breakArmor(e);
  }

  function breakArmor(e) {
    e.stage++;
    fight.stats.breaks++;
    const L = fight.layout;
    shards(L.cx, L.chestY + 40, 26);
    burst(L.cx, L.chestY + 40, 30, ['#ffffff', '#ffe2a8', '#d9dde6'], 420, 0.7, 5, 250);
    fight.shake = 16; fight.hitStop = 0.12;
    e.anim.white = 1;
    sfx.armor();
    const last = isLastStage(e);
    // близкий кадр: камера наезжает на противницу, время замедляется — видно, что изменилось
    fight.cam = { t: 0, dur: last ? 2.1 : 1.7, x: L.cx, y: L.top + L.dh * 0.34, z: last ? 1.6 : 1.45 };
    fight.weak = null;
    floatText(W / 2, HUD_BOTTOM - 90, t(last ? 'fight.shattered' : 'fight.armorBroken'), last ? '#ffd060' : '#ffe2a8', last ? 36 : 34, 1.6, -20);   // ниже лица — в близком кадре видно её
    e.state = 'stun'; e.st = 1.5; e.strikesLeft = 0;
    e.stam = e.stamMax * 0.85;
    if (e.kind === 'boss') applyPhase(e, e.stage);
    else if (fight.ed.rage) {
      e.atk.interval = e.atk.interval.map((v) => v * 0.8);
      e.atk.telegraph = Math.max(0.62, e.atk.telegraph * 0.92);
      fight.banner = { title: t('fight.rage'), sub: t('fight.rageSub'), t: 0, life: 1.6 };
    }
    // без брони рядовые атакуют вдвое реже; сдаться она не может — бой до конца здоровья или до захвата
    if (last && e.kind !== 'boss' && !e.lastStand) {
      e.lastStand = true;
      e.atk.interval = e.atk.interval.map((v) => v * 2);
    }
    if (last) tip(fight.hero.seals > 0 ? t('tip.shattered') : t('tip.shatteredNoSeals'), 4);
    else tip(t('tip.armorBroken'));
  }

  // Захват: круг, начерченный на противнице без брони. Удача — печать тратится, противница поймана;
  // неудача — она получает урон росчерка (печать остаётся).
  function tryCapture(path, ring) {
    const h = fight.hero, e = fight.enemy;
    if (h.seals <= 0 || h.shock > 0) {
      if (h.seals <= 0) floatText(ring.x, ring.y - ring.r - 18, t('fight.noSeals'), '#ffb070', 22);
      heroSlash(path);
      return;
    }
    const chance = captureChance(e);
    fight.stats.captureTries++;
    if (Math.random() < chance) {
      fight.fx.trails.push({ pts: path.map((p) => ({ x: p.x, y: p.y })), t: 0, life: 0.9, color: '#e9c27a', w: 20 });
      capture();
      return;
    }
    fight.fx.trails.push({ pts: path.map((p) => ({ x: p.x, y: p.y })), t: 0, life: 0.5, color: '#ff8a6a', w: 14 });
    floatText(ring.x, ring.y - ring.r - 18, t('fight.captureFail', { p: Math.round(chance * 100) }), '#ff9a7a', 26, 1.2, -40);
    sfx.fail();
    heroSlash(path);
  }

  function capture() {
    const h = fight.hero;
    h.seals--;
    fight.stats.captures++;
    sfx.capture();
    const L = fight.layout;
    burst(L.cx, L.chestY, 50, ['#e9c27a', '#fff3d0', '#b48cff'], 300, 1, 4, 0);
    const prev = save.captured[fight.id];
    save.captured[fight.id] = { lvl: Math.max(fight.enemy.lvl, prev ? prev.lvl : 0), at: Date.now(), times: (prev ? prev.times || 1 : 0) + 1 };
    foeDone('captured');
  }

  function endByEnemyHp() {
    const e = fight.enemy;
    if (isLastStage(e)) { sfx.win(); foeDone('defeated'); }
    else foeDone('escaped');
  }

  function recordResult(foe, outcome) {
    foe.outcome = outcome;
    fight.results.push({ id: foe.id, ed: foe.ed, outcome, stage: foe.enemy.stage, lvl: foe.enemy.lvl });
  }
  // Передняя выбыла: следующей станет случайная из оставшихся
  function foeDone(outcome) {
    const foe = fight.front, e = foe.enemy;
    if (foe.outcome) return;
    recordResult(foe, outcome);
    const rest = fight.foes.filter((f) => !f.outcome);
    if (!rest.length) { endFight(outcome); return; }
    e.state = 'leaving'; e.st = 0;
    fight.weak = null;
    fight.threads = fight.threads.filter((th) => th.foe !== foe);
    fight.next = { t: 1.0, foe: pick(rest) };
  }
  // Задняя противница выбыла от росчерков: брони она не теряла, поэтому сбегает
  function backDone(foe) {
    recordResult(foe, isLastStage(foe.enemy) ? 'defeated' : 'escaped');
    foe.enemy.state = 'leaving'; foe.enemy.st = 0;
    fight.threads = fight.threads.filter((th) => th.foe !== foe);
    if (!fight.foes.some((f) => !f.outcome)) endFight(foe.outcome);
  }

  function endFight(outcome) {
    if (fight.over) return;
    fight.over = true;
    const group = fight.foes.length > 1;
    fight.outcome = outcome === 'lose' ? 'lose' : group ? 'group' : outcome;
    fight.endT = fight.t;
    fight.overT = 0;
    const e = fight.enemy;
    e.state = 'leaving'; e.st = 0;
    fight.spheres = []; fight.weak = null; fight.vines = []; fight.threads = []; fight.next = null;
    if (outcome === 'lose') sfx.lose();
    save.fights.unshift({ id: fight.foes[0].id, ids: group ? fight.foes.map((f) => f.id) : undefined, h: fight.hero.lvl, e: e.lvl, t: Math.round(fight.t), o: fight.outcome, run: fight.inRun });
    save.fights = save.fights.slice(0, 8);
    writeSave();
  }

  function startTelegraph(e, dur) {
    e.state = 'telegraph'; e.st = 0; e.telDur = dur;
    sfx.tel();
  }

  function enemyImpact(e) {
    const h = fight.hero, L = fight.layout;
    const since = fight.t - fight.guardT;
    const { pmin, pmax } = parryWindow(h);
    const presses = fight.guardPresses.filter((t0) => fight.t - t0 <= 0.6).length;   // спам по кругу не парирует
    const holding = (fight.autoGuard || (input.down && input.guardPress && !input.swiping)) && h.entangled <= 0;
    fight.guardPresses = [];
    const dmg = e.atk.dmg * e.dmgScale * levelMod(e.lvl, h.lvl) * rand(0.9, 1.1);
    const c = guardCenter();
    e.anim.lunge = 1;
    if (since >= pmin && since <= pmax && presses <= 1 && input.lastTapT < fight.guardT - 0.2) {
      fight.guardT = -9;
      fight.fx.shields.push({ x: c.x, y: c.y, r: GUARD_R, t: 0, life: 0.5, color: '#9fffc9' });
      enemyStamina(e, 14 * h.stamPower);
      fight.stats.parries++;
      e.regenStop = fight.t;
      addCombo(h);
      if (hasRelic(h, 'fang')) h.chargeT = CHARGE_FULL;
      floatText(L.cx, L.chestY - 30, t('fight.parry'), '#bfefff', 34, 1.1, -40);
      burst(L.cx, L.chestY + 60, 30, ['#ffffff', '#bfefff', '#7fd8ff'], 420, 0.5, 4, 100);
      fight.shake = Math.max(fight.shake, 6);
      sfx.parry();
      e.state = 'stun'; e.st = 0.7; e.strikesLeft = 0;
      return;
    }
    if (holding) {
      fight.fx.shields.push({ x: c.x, y: c.y, r: GUARD_R, t: 0, life: 0.45, color: '#ffe28a' });
      const taken = dmg * D.hero.blockTaken * h.mods.blockMul;
      hurtHero(taken, false);
      enemyStamina(e, 6 * h.stamPower);
      fight.stats.blocks++;
      addCombo(h);
      floatText(W / 2, 640, t('fight.block', { n: Math.round(taken) }), '#ffe28a', 26);
      sfx.block();
      fight.shake = Math.max(fight.shake, 4);
      return;
    }
    hurtHero(dmg, true);
    h.combo = 0;
    floatText(W / 2, 640, '−' + Math.round(dmg), '#ff6b5e', 34);
    sfx.hurt();
    fight.shake = Math.max(fight.shake, 12);
    if (fight.stats.parries + fight.stats.blocks < 2) tip(t('tip.guard'));
  }

  function hurtHero(dmg, flash) {
    const h = fight.hero;
    h.hp = Math.max(0, h.hp - dmg);
    fight.stats.taken += dmg;
    if (flash) h.hurtFlash = 1;
    if (h.hp <= 0 && !fight.over) endFight('lose');
  }

  // сферы
  function spawnSpheres(e) {
    const sd = e.sph;
    const n = randi(sd.count[0], sd.count[1]);
    const slow = (hasRelic(fight.hero, 'bell') ? 1.3 : 1) * fight.hero.mods.sphereSlow;
    for (let i = 0; i < n && fight.spheres.length < 5; i++) {
      let x, y, ok = false;
      for (let tries = 0; tries < 30 && !ok; tries++) {
        x = rand(70, W - 70); y = rand(HUD_TOP + 70, HUD_BOTTOM - 70);
        ok = fight.spheres.every((s) => dist(x, y, s.x, s.y) > 110);
      }
      if (!ok) continue;
      fight.spheres.push({ x, y, r: 14, r0: 14, r1: 40, t: 0, grow: rand(sd.grow[0], sd.grow[1]) * (1 - 0.04 * (e.lvl - 1)) * slow, el: pick(sd.elements), taps: 0, hitFlash: 0, seed: Math.random() * 10 });
    }
    sfx.pop();
  }

  function popSphere(s, linked) {
    fight.spheres = fight.spheres.filter((o) => o !== s);
    const c = D.elements[s.el];
    burst(s.x, s.y, linked ? 18 : 10, [c.color, c.core, '#ffffff'], 260, 0.5, 4, 0);
  }

  function sphereBurst(s) {
    fight.spheres = fight.spheres.filter((o) => o !== s);
    const h = fight.hero, e = fight.enemy, c = D.elements[s.el];
    burst(s.x, s.y, 34, [c.color, c.core], 380, 0.7, 6, 0);
    fight.shake = Math.max(fight.shake, 6);
    sfx.burst();
    const base = e.atk.dmg * e.dmgScale * levelMod(e.lvl, h.lvl);
    if (s.el === 'fire') { h.burn = 4; h.burnDps = base * 0.25; floatText(s.x, s.y, t('sph.burn'), c.color, 24); }
    if (s.el === 'electric') { h.shock = 3; hurtHero(base * 0.3, true); floatText(s.x, s.y, t('sph.shock'), c.color, 24); }
    if (s.el === 'ice') { h.chill = 5; hurtHero(base * 0.3, true); floatText(s.x, s.y, t('sph.chill'), c.color, 22); }
    if (s.el === 'ghost') { h.burn = 3; h.burnDps = base * 0.25; h.chill = 3; floatText(s.x, s.y, t('sph.ghost'), c.color, 24); }
    if (s.el === 'nature') {
      const heal = Math.round(e.hpMax * 0.05);
      e.hp = Math.min(e.hpMax, e.hp + heal);
      floatText(fight.layout.cx, fight.layout.chestY, '+' + heal, c.color, 30);
      fight.fx.links.push({ pts: [{ x: s.x, y: s.y }, { x: fight.layout.cx, y: fight.layout.chestY }], t: 0, life: 0.5, color: c.color });
    }
    tip(t('tip.spheres'));
  }

  // помехи босса: тянутся от края к центру, срезаются росчерком поперёк
  const hazardTexts = (k) => Object.fromEntries(['cut', 'status', 'hit', 'guardOff', 'tip', 'short', 'stat'].map((f) => [f, t(`hz.${k}.${f}`)]));
  const HAZARDS = {
    vines: { ...hazardTexts('vines'), color: '#6fdc6a', cutColor: '#9fe89a' },
    wisps: { ...hazardTexts('wisps'), color: '#6cc8ff', cutColor: '#bfe6ff' }
  };
  function spawnVine() {
    fight.vines.push({ side: Math.random() < 0.5 ? 'left' : 'right', y: rand(260, 640), t: 0, grow: rand(4.6, 5.6), seed: Math.random() * 10 });
  }
  function vineTip(v) {
    const k = clamp(v.t / v.grow, 0, 1);
    const x = v.side === 'left' ? lerp(0, 250, k) : lerp(W, W - 250, k);
    return { x, y: v.y + Math.sin(G.time * 3 + v.seed) * 8, k };
  }

  function pathHitsCircle(path, cx, cy, r) {
    for (let i = 1; i < path.length; i++) if (segDist(cx, cy, path[i - 1], path[i]) < r) return true;
    return false;
  }
  function segDist(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1);
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }
  function segIntersect(a, b, c, d) {
    const cr = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  // Зона противницы, по которой засчитываются рассечение и круг захвата
  function enemyBox() {
    const L = fight.layout;
    return { x0: L.cx - L.dw * 0.32, x1: L.cx + L.dw * 0.32, y0: L.top + L.dh * 0.08, y1: L.bottom - 20 };
  }
  const inBox = (b, x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;

  // Росчерк-круг: путь обходит свой центр почти полностью, радиус не меньше CIRCLE_MIN_R, форма близка к окружности
  function circleGesture(path) {
    if (path.length < 8) return null;
    let cx = 0, cy = 0;
    for (const p of path) { cx += p.x; cy += p.y; }
    cx /= path.length; cy /= path.length;
    const ds = path.map((p) => dist(p.x, p.y, cx, cy));
    const r = ds.reduce((a, d) => a + d, 0) / ds.length;
    if (r < CIRCLE_MIN_R) return null;
    const dev = Math.sqrt(ds.reduce((a, d) => a + (d - r) * (d - r), 0) / ds.length) / r;
    if (dev > 0.35) return null;
    let sweep = 0;
    for (let i = 1; i < path.length; i++) {
      let da = Math.atan2(path[i].y - cy, path[i].x - cx) - Math.atan2(path[i - 1].y - cy, path[i - 1].x - cx);
      if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
      sweep += da;
    }
    return Math.abs(sweep) >= CIRCLE_SWEEP ? { x: cx, y: cy, r } : null;
  }

  function resolveSwipe(path) {
    if (!fighting()) return;
    const e = fight.enemy;
    // лианы: росчерк поперёк срезает
    for (const v of [...fight.vines]) {
      const base = { x: v.side === 'left' ? 0 : W, y: v.y };
      const tp = vineTip(v);
      for (let i = 1; i < path.length; i++) {
        if (segIntersect(path[i - 1], path[i], base, tp)) {
          fight.vines = fight.vines.filter((o) => o !== v);
          burst(tp.x, tp.y, 16, fight.ed.hazard === 'wisps' ? ['#6cc8ff', '#bfe6ff', '#ffffff'] : ['#6fdc6a', '#3f8f3a', '#bfffb0'], 260, 0.5, 4, fight.ed.hazard === 'wisps' ? -60 : 300);
          if (enemyActive(e)) enemyStamina(e, 6 * fight.hero.stamPower);
          floatText(tp.x, tp.y - 20, fight.hazard.cut, fight.hazard.cutColor, 20);
          fight.stats.vines++;
          sfx.vine();
          break;
        }
      }
    }
    // нить лечения рвётся росчерком поперёк
    for (const th of [...fight.threads]) {
      const [a, b] = threadLine(th);
      for (let i = 1; i < path.length; i++) {
        if (!segIntersect(path[i - 1], path[i], a, b)) continue;
        fight.threads = fight.threads.filter((x) => x !== th);
        th.foe.enemy.stam = Math.max(0, th.foe.enemy.stam - 12 * fight.hero.stamPower);
        floatText(path[i].x, path[i].y - 20, t('fight.threadCut'), D.elements.nature.color, 22);
        burst(path[i].x, path[i].y, 14, [D.elements.nature.color, '#eaffd8'], 240, 0.4, 3, 0);
        sfx.vine();
        break;
      }
    }
    if (isLastStage(e) && enemyActive(e)) {
      const ring = circleGesture(path);
      if (ring && inBox(enemyBox(), ring.x, ring.y)) { tryCapture(path, ring); return; }
    }
    const hit = [];
    for (let i = 1; i < path.length; i++) {
      for (const s of fight.spheres) {
        if (!hit.includes(s) && segDist(s.x, s.y, path[i - 1], path[i]) < s.r + 12) hit.push(s);
      }
    }
    if (hit.length >= 2) {
      const n = hit.length;
      const same = hit.every((s) => s.el === hit[0].el);
      const amount = Math.round(((same ? 12 : 9) * (n - 1) + (n >= 3 ? 8 : 0)) * fight.hero.stamPower);
      fight.fx.links.push({ pts: hit.map((s) => ({ x: s.x, y: s.y })), t: 0, life: 0.5, color: D.elements[hit[0].el].color });
      for (const s of hit) popSphere(s, true);
      if (enemyActive(e)) enemyStamina(e, amount);
      fight.stats.links++;
      e.regenStop = fight.t;
      addCombo(fight.hero);
      floatText(hit[n - 1].x, hit[n - 1].y - 30, t('fight.link', { n, amount }), '#ffe9a8', 24);
      sfx.link();
      if (n >= 3 && hasRelic(fight.hero, 'moon')) tryBreak(e);
      return;
    }
    if (e.state === 'telegraph') {
      const c = guardCenter();
      if (pathHitsCircle(path, c.x, c.y, GUARD_R)) { floatText(c.x, c.y - GUARD_R - 14, t('fight.circleNoDmg'), '#cfd6e6', 18, 0.7); return; }
    }
    let len = 0;
    for (let i = 1; i < path.length; i++) len += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
    const box = enemyBox();
    const crosses = path.some((p) => inBox(box, p.x, p.y));
    const backs = backFoes().filter((f) => path.some((p) => inBox(foeBox(f), p.x, p.y)));
    if (len >= 90 && (crosses || backs.length)) heroSlash(path, crosses, backs);
    else if (hit.length === 1) floatText(hit[0].x, hit[0].y - 30, t('fight.needTwo'), '#ffe9a8', 20);
  }

  // ---------------------------------------------------------------- обновление боя
  function updateFight(dt) {
    const f = fight;
    if (!f.over) f.t += dt; else f.overT += dt;
    let dtE = dt;
    if (f.hitStop > 0) { f.hitStop -= dt; dtE = 0; }
    if (f.cam) {
      f.cam.t += dt;
      if (f.cam.t >= f.cam.dur || f.over) f.cam = null;
      else dtE *= 0.25;          // замедление на время близкого кадра
    }
    updateHero(dt);
    updateAuto();
    updateEnemy(dtE, dt);
    updateBacks(dtE, dt);
    updateNextFoe(dt);
    layoutFoes(false);
    for (const foe of f.foes) {
      const p = foe.pos, g = foe.target, k = Math.min(1, dt * 5);
      p.cx = lerp(p.cx, g.cx, k); p.bottom = lerp(p.bottom, g.bottom, k); p.s = lerp(p.s, g.s, k);
    }
    updateSpheres(dtE);
    updateVines(dtE);
    updateFx(dt);
    f.shake = Math.max(0, f.shake - dt * 40);
    if (f.tipT > 0) f.tipT -= dt;
    if (f.banner) { f.banner.t += dt; if (f.banner.t > f.banner.life) f.banner = null; }

    if (f.over && !f.resultShown && f.overT > 1.4) { f.resultShown = true; showResult(); }
  }

  // ---------------------------------------------------------------- автобой
  // Компьютер атакует (быстрые и заряженные тапы, росчерки) и блокирует удары: держит палец в круге
  // заранее, поэтому выходит блок, а не парирование. Не захватывает и специально не соединяет сферы.
  // Включается и выключается кнопкой «Авто» в любой момент (G.auto сохраняется между боями).
  function autoPlan(e) {
    const r = Math.random();
    if (tired(e) && !isLastStage(e)) return r < 0.6 ? { kind: 'tap', charge: rand(1.75, 2.05) } : { kind: 'slash', charge: rand(1.3, 2) };
    // серия быстрых тапов, заряженный удар или росчерк
    return r < 0.5 ? { kind: 'tap', charge: rand(0.1, 0.3), burst: randi(2, 4) } : r < 0.85 ? { kind: 'tap', charge: rand(1.6, 2.05) } : { kind: 'slash', charge: rand(0.9, 2) };
  }
  function updateAuto() {
    const f = fight, h = f.hero, e = f.enemy;
    f.autoGuard = false;
    if (!G.auto || f.over || f.next || !enemyActive(e)) return;
    if (e.state === 'telegraph' && e.telDur - e.st < parryWindow(h).pmax + 0.25) { f.autoGuard = true; return; }
    if (!f.autoPlan) f.autoPlan = autoPlan(e);
    const plan = f.autoPlan;
    if (h.exhausted || h.stam < D.hero.slashCost * 1.6 || h.chargeT < plan.charge) return;
    const L = f.layout;
    if (plan.kind === 'slash' && e.state !== 'telegraph') {
      const y0 = L.chestY + rand(-20, 40), x0 = L.cx - L.dw * 0.32, x1 = L.cx + L.dw * 0.32;
      resolveSwipe(Array.from({ length: 12 }, (_, i) => ({ x: lerp(x0, x1, i / 11), y: y0 + i * 4 })));
    } else {
      // тап: в слабую точку, иначе по телу мимо сфер
      let p = f.weak ? { x: f.weak.x, y: f.weak.y } : null;
      for (let k = 0; k < 8 && !p; k++) {
        const c = { x: L.cx + rand(-0.13, 0.13) * L.dw, y: L.chestY + rand(-30, 90) };
        if (f.spheres.every((s) => dist(c.x, c.y, s.x, s.y) > s.r + 18)) p = c;
      }
      if (!p) return;
      f.fx.shields.push({ x: p.x, y: p.y, r: 14, t: 0, life: 0.25, color: '#ffe9a8' });
      heroTap(p.x, p.y);
      if (plan.burst > 1) { plan.burst--; plan.charge = rand(0.1, 0.22); return; }
    }
    f.autoPlan = autoPlan(e);
  }

  // после ухода передней — пауза, затем вперёд выходит случайная из оставшихся
  function updateNextFoe(dt) {
    const f = fight;
    if (!f.next || f.over) return;
    f.next.t -= dt;
    if (f.next.t > 0) return;
    const rest = f.foes.filter((x) => !x.outcome);
    const nf = rest.includes(f.next.foe) ? f.next.foe : pick(rest);
    f.next = null;
    if (!nf) return;
    setFront(nf);
    const e = nf.enemy;
    e.state = 'idle'; e.st = 0; e.nextAttack = rand(1.0, 1.6); e.strikesLeft = 0;
    f.banner = { title: nf.ed.name, sub: t('fight.nextUp'), t: 0, life: 1.4 };
  }

  function updateHero(dt) {
    const h = fight.hero;
    if (fight.over) return;
    if (!input.down) h.chargeT += dt * (h.chill > 0 ? 0.5 : 1) * h.mods.chargeSpeed;
    if (fight.t - h.lastStamUse > 0.5) h.stam = Math.min(h.stamMax, h.stam + D.hero.stamRegen * h.mods.regenMul * dt);
    if (h.exhausted && h.stam >= h.stamMax * 0.35) h.exhausted = false;
    if (h.chill > 0) h.chill -= dt;
    if (h.entangled > 0) h.entangled -= dt;
    if (h.hurtFlash > 0) h.hurtFlash = Math.max(0, h.hurtFlash - dt * 2.5);
    if (h.burn > 0) {
      h.burn -= dt;
      h.burnTick += dt;
      hurtHero(h.burnDps * dt, false);
      if (h.burnTick > 0.5) { h.burnTick = 0; floatText(rand(200, 340), 690, '−' + Math.max(1, Math.round(h.burnDps * 0.5)), '#ff9a50', 18, 0.6); }
    }
  }

  function updateEnemy(dt, rdt) {
    const e = fight.enemy, a = e.anim, ed = fight.ed;
    a.white = Math.max(0, a.white - rdt * 4);
    a.lunge = Math.max(0, a.lunge - rdt * 3.2);
    a.knock = Math.max(0, a.knock - rdt * 5);
    a.sx = lerp(a.sx, 1, Math.min(1, rdt * 14));
    a.sy = lerp(a.sy, 1, Math.min(1, rdt * 14));
    if (e.state === 'leaving') { e.st += rdt; return; }
    if (dt === 0) return;
    // выносливость медленно восстанавливается всегда; парирование и связка сфер останавливают это на 2 с
    if (e.state !== 'stun' && fight.t - e.regenStop > 2) e.stam = Math.min(e.stamMax, e.stam + ed.stamRegen * dt);
    if (e.burn > 0 && enemyActive(e)) {
      e.burn -= dt; e.burnTick += dt;
      e.hp = Math.max(0, e.hp - e.burnDps * dt);
      if (e.burnTick > 0.6) { e.burnTick = 0; floatText(fight.layout.cx + rand(-60, 60), fight.layout.chestY + rand(-40, 40), String(Math.round(e.burnDps * 0.6)), '#ff9a50', 18, 0.6); }
      if (e.hp <= 0) { endByEnemyHp(); return; }
    }

    switch (e.state) {
      case 'idle':
        e.nextAttack -= dt;
        if (e.nextAttack <= 0) {
          e.strikesLeft = randi(e.atk.strikes[0], e.atk.strikes[1]);
          startTelegraph(e, e.atk.telegraph * rand(0.92, 1.08));
        }
        break;
      case 'telegraph':
        e.st += dt;
        if (e.st >= e.telDur) {
          enemyImpact(e);
          if (e.state !== 'telegraph') break;
          e.strikesLeft--;
          if (e.strikesLeft > 0) startTelegraph(e, e.atk.follow || Math.max(0.6, e.atk.telegraph * 0.7));
          else { e.state = 'recover'; e.st = 0; }
        }
        break;
      case 'recover':
        e.st += dt;
        if (e.st > 0.45) { e.state = 'idle'; e.nextAttack = rand(e.atk.interval[0], e.atk.interval[1]); }
        break;
      case 'stun':
        e.st -= dt;
        if (e.st <= 0) { e.state = 'idle'; e.nextAttack = rand(0.7, 1.3); }
        break;
    }
    if (e.state === 'idle' || e.state === 'recover') {
      e.nextSpheres -= dt;
      if (e.nextSpheres <= 0) { spawnSpheres(e); e.nextSpheres = rand(e.sph.every[0], e.sph.every[1]); }
      if (e.vinesCfg) {
        e.nextVine -= dt;
        if (e.nextVine <= 0 && fight.vines.length < 3) { spawnVine(); e.nextVine = rand(e.vinesCfg.every[0], e.vinesCfg.every[1]); }
      }
    }
    if (enemyActive(e) && e.state !== 'stun') {
      if (fight.weak) {
        fight.weak.t += dt;
        if (fight.weak.t > fight.weak.life) fight.weak = null;
      } else {
        e.nextWeak -= dt;
        if (e.nextWeak <= 0) {
          const L = fight.layout;
          fight.weak = { x: L.cx + rand(-0.18, 0.18) * L.dw, y: L.top + L.dh * rand(0.25, 0.62), t: 0, life: 1.6 };
          e.nextWeak = rand(5, 8);
        }
      }
    }
  }

  function updateSpheres(dt) {
    for (const s of [...fight.spheres]) {
      s.t += dt;
      s.hitFlash = Math.max(0, s.hitFlash - dt * 5);
      const k = clamp(s.t / s.grow, 0, 1);
      s.r = Math.max(s.r, lerp(s.r0, s.r1, k) * Math.pow(0.86, s.taps));
      if (s.t >= s.grow) sphereBurst(s);
    }
  }

  function updateVines(dt) {
    const h = fight.hero;
    for (const v of [...fight.vines]) {
      v.t += dt;
      if (v.t >= v.grow) {
        fight.vines = fight.vines.filter((o) => o !== v);
        h.entangled = 2.5;
        hurtHero(5 * fight.enemy.dmgScale, true);
        floatText(W / 2, 560, fight.hazard.hit, fight.hazard.color, 32);
        tip(fight.hazard.tip);
        sfx.vine();
      }
    }
  }

  function updateFx(dt) {
    const fx = fight.fx;
    for (const p of fx.texts) { p.t += dt; p.y += p.vy * dt; p.vy *= 0.96; }
    fx.texts = fx.texts.filter((p) => p.t < p.life);
    for (const p of fx.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.vx *= 0.98; }
    fx.parts = fx.parts.filter((p) => p.t < p.life);
    for (const p of fx.shards) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.rot += p.vr * dt; }
    fx.shards = fx.shards.filter((p) => p.t < p.life);
    for (const k of ['trails', 'links', 'shields']) {
      for (const p of fx[k]) p.t += dt;
      fx[k] = fx[k].filter((p) => p.t < p.life);
    }
  }

  // ---------------------------------------------------------------- отрисовка боя
  function renderFight() {
    const f = fight;
    const sx = f.shake ? rand(-f.shake, f.shake) : 0, sy = f.shake ? rand(-f.shake, f.shake) : 0;
    ctx.save();
    ctx.translate(sx, sy);
    const k = camZoom();
    ctx.save();
    if (k > 0) {
      // фокус камеры плавно переходит из точки на противнице в верхнюю часть экрана
      const c = f.cam, z = lerp(1, c.z, k);
      ctx.translate(lerp(c.x, W / 2, k), lerp(c.y, 400, k));
      ctx.scale(z, z);
      ctx.translate(-c.x, -c.y);
    }
    // в групповом бою фон приближен: коридор шире, задним противницам есть где стоять
    f.bgZoom = lerp(f.bgZoom || 1, backFoes().length ? BG_GROUP_ZOOM : 1, 0.06);
    const bgz = (draw) => {
      ctx.save();
      ctx.translate(W / 2, 390); ctx.scale(f.bgZoom, f.bgZoom); ctx.translate(-W / 2, -390);
      draw();
      ctx.restore();
    };
    bgz(() => drawBackground(f.theme, G.time));
    drawFoes();
    drawWeak();
    drawTelegraph();
    bgz(() => drawForeground(f.theme));
    ctx.restore();
    if (k > 0) drawCloseupVignette(k);
    drawVines();
    drawSpheres();
    drawFx();
    drawCaptureHint();
    ctx.restore();
    drawHurtOverlay();
    drawTopHud();
    drawBottomHud();
    drawBanner();
    drawSwipe();
    drawSquadTip();
  }

  // Близкий кадр: 0 — обычный вид, 1 — полное приближение (наезд 0,3 с, отъезд 0,5 с)
  function camZoom() {
    const c = fight.cam;
    if (!c) return 0;
    const k = Math.min(c.t / 0.3, 1, (c.dur - c.t) / 0.5);
    return clamp(k, 0, 1) * clamp(k, 0, 1) * (3 - 2 * clamp(k, 0, 1));
  }
  function drawCloseupVignette(k) {
    const v = ctx.createRadialGradient(W / 2, 360, 120, W / 2, 360, 520);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${0.45 * k})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  // Сначала задние (притемнены), нити лечения, затем передняя и уходящие
  function drawFoes() {
    const f = fight;
    for (const foe of f.foes) if (foe !== f.front && foe.slot !== 'gone') drawFoe(foe, true);
    drawThreads();
    for (const foe of f.foes) if (foe.slot === 'gone') drawFoe(foe, false);
    drawFoe(f.front, false);
    if (camZoom() < 0.05) for (const foe of f.foes) if (foe !== f.front && !foe.outcome) drawBackHud(foe);
  }

  function drawThreads() {
    for (const th of fight.threads) {
      const [a, b] = threadLine(th), k = th.t / th.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(111,220,106,${0.25 + 0.35 * k})`; ctx.lineWidth = 10; ctx.lineCap = 'round';
      line(ctx, a.x, a.y, b.x, b.y);
      ctx.strokeStyle = `rgba(230,255,210,${0.6 + 0.3 * Math.sin(G.time * 12)})`; ctx.lineWidth = 3;
      line(ctx, a.x, a.y, b.x, b.y);
      for (let i = 0; i < 4; i++) {
        const p = (G.time * 0.8 + i / 4) % 1;
        ctx.fillStyle = 'rgba(200,255,180,.9)';
        ctx.beginPath(); ctx.arc(lerp(a.x, b.x, p), lerp(a.y, b.y, p), 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Над задней противницей: имя, здоровье, стрелка выхода вперёд
  function drawBackHud(foe) {
    const e = foe.enemy, L = posRect(foe), w = 96, x = L.cx - w / 2, y = Math.max(HUD_TOP + 8, L.top - 8);
    ctx.save();
    ctx.textAlign = 'center'; ctx.font = `600 12px ${bodyFont}`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,6,12,.9)';
    ctx.strokeText(foe.ed.name, L.cx, y - 6); ctx.fillStyle = '#e9c27a'; ctx.fillText(foe.ed.name, L.cx, y - 6);
    bar(x, y, w, 7, e.hp / e.hpMax, '#d9473f');
    if (foe.sup.stepT > 0) {
      const k = 1 - foe.sup.stepT / 1.6, ay = y - 46 + Math.sin(G.time * 10) * 3;
      ctx.fillStyle = '#ffd060';
      ctx.beginPath(); ctx.moveTo(L.cx - 14, ay); ctx.lineTo(L.cx + 14, ay); ctx.lineTo(L.cx, ay + 16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(L.cx, ay + 6, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFoe(foe, back) {
    const f = fight, e = foe.enemy, a = e.anim, L = posRect(foe);
    if (e.state === 'leaving' && e.st > 2.5) return;
    const sts = assets[foe.id].stages;
    const st = sts[spriteIndex(sts.length, e.stage, e.parts)];
    let x = L.cx, y = L.bottom, sc = 1, alpha = 1, rot = 0;
    const breathe = 1 + Math.sin(G.time * 2.1) * 0.006;
    if (e.state === 'stun') rot = Math.sin(G.time * 9) * 0.012;
    if (e.state === 'telegraph') {
      const p = e.st / e.telDur;
      x += Math.sin(G.time * 60) * 2.5 * p;
      sc *= 1 - 0.02 * p;
    }
    sc *= 1 + 0.09 * a.lunge;
    y += 26 * a.lunge;
    y -= 10 * a.knock;
    if (e.state === 'leaving') {
      const lt = e.st, o = foe.outcome || f.outcome;
      if (o === 'escaped') { x += (x < W / 2 ? -1 : 1) * lt * 520; alpha = clamp(1 - lt * 0.9, 0, 1); }
      else if (o === 'captured') { sc *= Math.max(0.05, 1 - lt * 0.75); alpha = clamp(1 - lt * 0.5, 0, 1); y -= lt * 120; }
      else if (o !== 'lose') { alpha = clamp(1 - lt * 0.8, 0, 1); y += lt * 60; }
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sc * a.sx, sc * a.sy * breathe);
    const dx = -L.dw / 2, dy = -L.dh;
    ctx.drawImage(st.img, dx, dy, L.dw, L.dh);
    if (e.state === 'telegraph') {
      const p = e.st / e.telDur;
      ctx.globalAlpha = alpha * (0.12 + 0.3 * p) * (0.75 + 0.25 * Math.sin(G.time * 24));
      ctx.drawImage(st.red, dx, dy, L.dw, L.dh);
    }
    if (back && foe.sup.stepT <= 0) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.drawImage(st.dark, dx, dy, L.dw, L.dh);
    }
    if (a.white > 0) {
      ctx.globalAlpha = alpha * a.white;
      ctx.drawImage(st.white, dx, dy, L.dw, L.dh);
    }
    ctx.restore();
    if (back) return;
    if (e.state === 'stun') drawStars(L.cx, L.top + 30);
    if (e.burn > 0 && enemyActive(e)) {
      for (let i = 0; i < 2; i++) burstAt(L.cx + rand(-L.dw * 0.25, L.dw * 0.25), L.chestY + rand(-60, 120));
    }
  }
  function burstAt(x, y) {
    if (Math.random() < 0.35) fight.fx.parts.push({ x, y, vx: rand(-20, 20), vy: rand(-120, -60), t: 0, life: 0.5, color: pick(['#ff9a50', '#ffd27a']), size: 4, grav: -40 });
  }

  function drawStars(x, y) {
    ctx.save();
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 22px serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const a = G.time * 4 + i * 2.1;
      ctx.fillText('✦', x + Math.cos(a) * 46, y + Math.sin(a) * 12);
    }
    ctx.restore();
  }

  function drawWeak() {
    const w = fight.weak;
    if (!w) return;
    const k = w.t / w.life;
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 14);
    const r = 16 + 6 * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(w.x, w.y, 2, w.x, w.y, r * 2.4);
    gr.addColorStop(0, `rgba(255,240,170,${0.9 * (1 - k * 0.5)})`);
    gr.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(w.x, w.y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(255,224,140,${1 - k * 0.6})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w.x, w.y, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke();
    ctx.restore();
  }

  function drawTelegraph() {
    const e = fight.enemy, L = fight.layout, h = fight.hero;
    if (e.state !== 'telegraph') return;
    const p = clamp(e.st / e.telDur, 0, 1);
    const left = e.telDur - e.st;
    const { pmin, pmax } = parryWindow(h);
    const c = guardCenter();
    const r = lerp(GUARD_R + 140, GUARD_R, p);
    const inParry = left <= pmax && left >= pmin;
    const holding = fight.autoGuard || (input.down && input.guardPress && !input.swiping);
    ctx.save();
    ctx.fillStyle = holding ? 'rgba(255,226,138,.24)' : inParry ? 'rgba(159,255,201,.16)' : 'rgba(255,255,255,.07)';
    ctx.beginPath(); ctx.arc(c.x, c.y, GUARD_R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = holding ? '#ffe28a' : 'rgba(255,255,255,.5)';
    ctx.stroke();
    ctx.lineWidth = inParry ? 6 : 4;
    ctx.strokeStyle = inParry ? '#9fffc9' : `rgba(255,${120 - 80 * p},${90 - 60 * p},.95)`;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = `700 15px ${bodyFont}`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,6,12,.8)';
    const label = holding ? t('tel.block') : inParry ? t('tel.now') : t('tel.press');
    ctx.strokeText(label, c.x, c.y + 5);
    ctx.fillStyle = holding ? '#ffe28a' : inParry ? '#9fffc9' : '#f3ece0';
    ctx.fillText(label, c.x, c.y + 5);
    ctx.fillStyle = '#ff5a4a';
    ctx.font = `bold ${40 + 8 * Math.sin(G.time * 20)}px ${displayFont}`;
    ctx.fillText('!', L.cx, L.top + 46);
    ctx.restore();
  }

  function drawSpheres() {
    for (const s of fight.spheres) {
      const c = D.elements[s.el];
      const k = clamp(s.t / s.grow, 0, 1);
      const danger = k > 0.75 ? 0.5 + 0.5 * Math.sin(G.time * 22) : 0;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.r * 2.1);
      gr.addColorStop(0, c.core);
      gr.addColorStop(0.35, c.color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.7 + 0.3 * danger;
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.core; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a0 = G.time * (3 + i) + s.seed + i * 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.45 + i * 0.18), a0, a0 + 1.6); ctx.stroke();
      }
      ctx.strokeStyle = danger ? '#ff5a4a' : 'rgba(255,255,255,.7)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      if (s.hitFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.hitFlash * 0.6})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
      if (s.taps) {
        ctx.fillStyle = '#fff'; ctx.font = '600 13px ' + bodyFont; ctx.textAlign = 'center';
        ctx.fillText(`${s.taps}/5`, s.x, s.y + s.r + 24);
      }
      ctx.restore();
    }
  }

  function drawVines() {
    if (fight.ed.hazard === 'wisps') { drawWisps(); return; }
    for (const v of fight.vines) {
      const tp = vineTip(v);
      const bx = v.side === 'left' ? 0 : W;
      const mx = (bx + tp.x) / 2, my = v.y + Math.sin(G.time * 2 + v.seed) * 22;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1f4a1e'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(bx, v.y); ctx.quadraticCurveTo(mx, my, tp.x, tp.y); ctx.stroke();
      ctx.strokeStyle = tp.k > 0.75 ? `rgba(255,${120 + 80 * Math.sin(G.time * 18)},90,1)` : '#4fa84a'; ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#6fdc6a';
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        const lx = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * tp.x;
        const ly = (1 - t) * (1 - t) * v.y + 2 * (1 - t) * t * my + t * t * tp.y;
        ctx.beginPath(); ctx.ellipse(lx, ly - 9, 9, 4, (i % 2 ? 0.6 : -0.6), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#bfffb0';
      ctx.beginPath(); ctx.arc(tp.x, tp.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawWisps() {
    for (const v of fight.vines) {
      const tp = vineTip(v);
      const bx = v.side === 'left' ? 0 : W;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // светящийся след
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(bx, tp.x, t), y = v.y + Math.sin(t * 6 + G.time * 4 + v.seed) * 14 * (1 - t) + (tp.y - v.y) * t;
        ctx.fillStyle = `rgba(110,200,255,${0.05 + 0.25 * t})`;
        ctx.beginPath(); ctx.arc(x, y, 4 + 8 * t, 0, Math.PI * 2); ctx.fill();
      }
      // пламя-огонёк
      const danger = tp.k > 0.75;
      const fl = 1 + 0.12 * Math.sin(G.time * 18 + v.seed);
      const gr = ctx.createRadialGradient(tp.x, tp.y, 2, tp.x, tp.y, 34 * fl);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, danger ? '#ff8a8a' : '#8fdcff'); gr.addColorStop(1, 'rgba(60,140,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(tp.x, tp.y, 34 * fl, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = danger ? '#ffd0d0' : '#dff4ff';
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y - 26 * fl);
      ctx.quadraticCurveTo(tp.x + 14, tp.y - 4, tp.x + 8, tp.y + 10);
      ctx.quadraticCurveTo(tp.x, tp.y + 16, tp.x - 8, tp.y + 10);
      ctx.quadraticCurveTo(tp.x - 14, tp.y - 4, tp.x, tp.y - 26 * fl);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFx() {
    const fx = fight.fx;
    ctx.save();
    for (const s of fx.shields) {
      const k = s.t / s.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = s.color; ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 + 0.4 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = s.color; ctx.globalAlpha = 0.15 * (1 - k);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    for (const l of fx.links) {
      const k = 1 - l.t / l.life;
      ctx.strokeStyle = l.color; ctx.lineWidth = 6 * k; ctx.globalAlpha = k;
      ctx.beginPath();
      l.pts.forEach((p, i) => {
        if (!i) { ctx.moveTo(p.x, p.y); return; }
        const q = l.pts[i - 1];
        for (let s = 1; s <= 6; s++) {
          const t = s / 6;
          ctx.lineTo(lerp(q.x, p.x, t) + (s < 6 ? rand(-10, 10) : 0), lerp(q.y, p.y, t) + (s < 6 ? rand(-10, 10) : 0));
        }
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const tr of fx.trails) {
      const k = 1 - tr.t / tr.life;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = tr.color; ctx.globalAlpha = k * 0.85; ctx.lineWidth = tr.w * k;
      ctx.beginPath();
      tr.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = tr.w * k * 0.3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of fx.parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const p of fx.shards) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.moveTo(-p.w / 2, -p.h / 2); ctx.lineTo(p.w / 2, -p.h / 3); ctx.lineTo(p.w / 3, p.h / 2); ctx.lineTo(-p.w / 2, p.h / 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const p of fx.texts) {
      const k = p.t / p.life;
      const pop = k < 0.12 ? 0.6 + k / 0.12 * 0.5 : 1.1 - Math.min(0.1, (k - 0.12));
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `700 ${Math.round(p.size * pop)}px ${displayFont}`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,6,12,.85)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  // Без брони: над противницей — шанс захвата кругом (или «нет печатей»)
  function drawCaptureHint() {
    const f = fight, e = f.enemy, L = f.layout;
    if (f.over || f.next || !isLastStage(e) || !enemyActive(e)) return;
    const seals = f.hero.seals > 0;
    const p = Math.round(captureChance(e) * 100);
    const text = seals ? t('hud.captureChance', { p }) : t('hud.noSeals');
    ctx.save();
    ctx.font = `700 15px ${bodyFont}`;
    const w = ctx.measureText(text).width + 46, hh = 28;
    const x = L.cx - w / 2, y = Math.max(HUD_TOP + 6, L.top - 4);
    const glow = seals ? 0.55 + 0.45 * Math.sin(G.time * 4) * (p / 70) : 0;
    ctx.fillStyle = 'rgba(16,12,20,.82)'; roundRect(x, y, w, hh, hh / 2); ctx.fill();
    ctx.strokeStyle = seals ? `rgba(233,194,122,${0.5 + 0.5 * glow})` : 'rgba(185,174,156,.4)'; ctx.lineWidth = 1.5;
    roundRect(x, y, w, hh, hh / 2); ctx.stroke();
    // значок: пунктирный круг
    ctx.setLineDash([3, 3]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + 17, y + hh / 2, 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = seals ? '#e9c27a' : '#b9ae9c'; ctx.textAlign = 'left';
    ctx.fillText(text, x + 31, y + 19);
    ctx.restore();
  }

  function drawBanner() {
    const b = fight.banner;
    if (!b) return;
    const k = b.t / b.life;
    const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    const y = 300;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(8,6,12,0)'); g.addColorStop(0.2, 'rgba(8,6,12,.85)'); g.addColorStop(0.8, 'rgba(8,6,12,.85)'); g.addColorStop(1, 'rgba(8,6,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 46, W, 84);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9c27a'; ctx.font = `600 30px ${displayFont}`;
    ctx.fillText(b.title, W / 2, y);
    ctx.fillStyle = '#d8ccb6'; ctx.font = `500 14px ${bodyFont}`;
    ctx.fillText(b.sub, W / 2, y + 24);
    ctx.restore();
  }

  function drawHurtOverlay() {
    const h = fight.hero;
    let a = h.hurtFlash * 0.45;
    if (h.hp / h.hpMax < 0.3 && !fight.over) a = Math.max(a, 0.12 + 0.08 * Math.sin(G.time * 5));
    if (a <= 0) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
    g.addColorStop(0, 'rgba(180,20,20,0)');
    g.addColorStop(1, `rgba(180,20,20,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, h / 2, Math.max(0, w) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function bar(x, y, w, h, frac, color, back = 'rgba(0,0,0,.55)') {
    ctx.fillStyle = back; roundRect(x, y, w, h, h / 2); ctx.fill();
    if (frac > 0) { ctx.fillStyle = color; roundRect(x, y, w * clamp(frac, 0, 1), h, h / 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(233,194,122,.35)'; ctx.lineWidth = 1; roundRect(x, y, w, h, h / 2); ctx.stroke();
  }
  function tag(text, x, y, color) {
    ctx.font = `700 11px ${bodyFont}`;
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = color; roundRect(x, y - 13, w, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(text, x + 7, y);
    return w;
  }
  function topGradient() {
    const g = ctx.createLinearGradient(0, 0, 0, HUD_TOP + 20);
    g.addColorStop(0, 'rgba(8,6,12,.92)'); g.addColorStop(1, 'rgba(8,6,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HUD_TOP + 20);
  }

  function drawTopHud() {
    const f = fight, e = f.enemy, ed = f.ed;
    topGradient();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e9c27a'; ctx.font = `600 24px ${displayFont}`;
    ctx.fillText(ed.name, 20, 38);
    let nx = 30 + ctx.measureText(ed.name).width;
    ctx.fillStyle = '#b9ae9c'; ctx.font = `500 15px ${bodyFont}`;
    const lvl = t('lvl', { n: e.lvl });
    ctx.fillText(lvl, nx, 38);
    nx += ctx.measureText(lvl).width + 10;
    if (e.kind === 'elite') tag(t('hud.elite'), nx, 36, '#c8622a');
    if (e.kind === 'boss') tag(t('hud.boss', { p: e.phase + 1, n: e.parts + 1 }), nx, 36, '#8a3cc0');

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f3ece0'; ctx.font = `600 20px ${displayFont}`;
    ctx.fillText(fmtTime(f.over ? f.endT : f.t), W - 20, 38);

    bar(20, 50, W - 40, 16, e.hp / e.hpMax, '#d9473f');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `600 11px ${bodyFont}`;
    ctx.fillText(`${Math.ceil(e.hp)} / ${e.hpMax}`, W / 2, 62);

    const tir = tired(e);
    const sw = 330;
    bar(20, 74, sw, 10, e.stam / e.stamMax, tir ? `rgba(255,${140 + 60 * Math.sin(G.time * 10)},60,1)` : '#e8b84a');
    ctx.fillStyle = '#fff'; ctx.fillRect(20 + sw * 0.3, 71, 2, 16);
    ctx.textAlign = 'left'; ctx.font = `600 12px ${bodyFont}`;
    ctx.fillStyle = tir ? '#ffb070' : '#b9ae9c';
    const stLabel = tir ? t('hud.tired') : t('hud.stamina');
    ctx.fillText(stLabel, 20, 102);
    if (e.lastStand) { ctx.fillStyle = '#9fd98a'; ctx.fillText(t('hud.lastStand'), 26 + ctx.measureText(stLabel).width, 102); }

    const parts = e.parts;
    ctx.textAlign = 'right'; ctx.fillStyle = '#b9ae9c';
    ctx.fillText(t('hud.armor'), W - 20, 102);
    for (let i = 0; i < parts; i++) {
      const broken = i < e.stage;
      const x = W - 32 - (parts - 1 - i) * 30, y = 79;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(10, -8); ctx.lineTo(10, 2); ctx.quadraticCurveTo(10, 10, 0, 14); ctx.quadraticCurveTo(-10, 10, -10, 2); ctx.closePath();
      ctx.fillStyle = broken ? 'rgba(60,50,60,.9)' : '#cfd6e6'; ctx.fill();
      ctx.strokeStyle = broken ? '#6b5f6b' : '#e9c27a'; ctx.lineWidth = 1.5; ctx.stroke();
      if (broken) { ctx.strokeStyle = '#d9473f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(1, 0); ctx.lineTo(-2, 5); ctx.lineTo(3, 12); ctx.stroke(); }
      ctx.restore();
    }

    const h = f.hero;
    if (h.combo >= 3) {
      ctx.textAlign = 'right';
      ctx.font = `700 ${30 + Math.min(14, h.combo)}px ${displayFont}`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,6,12,.85)';
      ctx.strokeText(`${h.combo}`, W - 24, 200);
      ctx.fillStyle = '#ffe2a8'; ctx.fillText(`${h.combo}`, W - 24, 200);
      ctx.font = `600 13px ${bodyFont}`; ctx.fillStyle = '#b9ae9c';
      ctx.fillText(t('hud.combo'), W - 24, 218);
    }
  }

  function bottomPanel(y0) {
    const g = ctx.createLinearGradient(0, y0 - 30, 0, y0 + 30);
    g.addColorStop(0, 'rgba(8,6,12,0)'); g.addColorStop(1, 'rgba(8,6,12,.96)');
    ctx.fillStyle = g; ctx.fillRect(0, y0 - 30, W, 60);
    ctx.fillStyle = 'rgba(8,6,12,.96)'; ctx.fillRect(0, y0 + 30, W, H - y0 - 30);
    ctx.strokeStyle = 'rgba(233,194,122,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, y0 + 22); ctx.lineTo(W - 20, y0 + 22); ctx.stroke();
  }

  function drawBottomHud() {
    const f = fight, h = f.hero;
    const y0 = HUD_BOTTOM;
    bottomPanel(y0);
    ctx.textAlign = 'left'; ctx.fillStyle = '#e9c27a'; ctx.font = `600 18px ${displayFont}`;
    ctx.fillText(t('hud.hero'), 20, y0 + 48);
    let hx = 28 + ctx.measureText(t('hud.hero')).width;
    ctx.fillStyle = '#b9ae9c'; ctx.font = `500 13px ${bodyFont}`;
    ctx.fillText(t('lvl', { n: h.lvl }), hx, y0 + 48);
    hx += ctx.measureText(t('lvl', { n: h.lvl })).width + 12;
    if (h.relics.length) { ctx.fillStyle = '#c9b6f0'; ctx.fillText(t('hud.relics', { n: h.relics.length }), hx, y0 + 48); }

    bar(20, y0 + 56, 300, 16, h.hp / h.hpMax, h.hp / h.hpMax < 0.3 ? '#d9473f' : '#5fbf6a');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `600 11px ${bodyFont}`;
    ctx.fillText(`${Math.ceil(h.hp)} / ${h.hpMax}`, 170, y0 + 68);
    const exh = h.exhausted;
    bar(20, y0 + 77, 300, 10, h.stam / h.stamMax, exh ? `rgba(255,${90 + 60 * Math.sin(G.time * 12)},70,1)` : '#4fa6e0');
    ctx.textAlign = 'left'; ctx.font = `600 12px ${bodyFont}`;
    ctx.fillStyle = exh ? '#ff9a7a' : '#b9ae9c';
    ctx.fillText(exh ? t('hud.winded') : t('hud.stamina'), 20, y0 + 102);

    let sx = 20;
    const pill = (text, color) => {
      ctx.font = `600 12px ${bodyFont}`;
      const w = ctx.measureText(text).width + 18;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(sx, y0 + 110, w, 20, 10); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; roundRect(sx, y0 + 110, w, 20, 10); ctx.stroke();
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, sx + 9, y0 + 124);
      sx += w + 8;
    };
    if (h.burn > 0) pill(t('pill.burn', { s: h.burn.toFixed(1) }), D.elements.fire.color);
    if (h.shock > 0) pill(t('pill.shock', { n: h.shock }), D.elements.electric.color);
    if (h.chill > 0) pill(t('pill.chill', { s: h.chill.toFixed(1) }), D.elements.ice.color);
    if (h.entangled > 0) pill(t('pill.hazard', { name: fight.hazard.status, s: h.entangled.toFixed(1) }), fight.hazard.color);

    D.squad.forEach((slot, i) => {
      const R = squadSlotRect(i), x = R.x0, y = R.y0, w = R.x1 - R.x0, hh = R.y1 - R.y0, id = squadMember(slot);
      if (id && assets[id]) {
        const pr = portraitRect(id, w / hh);
        ctx.save(); ctx.fillStyle = '#241a28'; roundRect(x, y, w, hh, 9); ctx.fill(); ctx.clip();
        ctx.drawImage(assets[id].stages[0].img, pr.x, pr.y, pr.w, pr.h, x, y, w, hh);
        ctx.fillStyle = 'rgba(8,6,12,.72)'; ctx.fillRect(x, y + hh - 15, w, 15);
        ctx.restore();
        ctx.strokeStyle = 'rgba(233,194,122,.85)'; ctx.lineWidth = 1.5; roundRect(x, y, w, hh, 9); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.04)'; roundRect(x, y, w, hh, 9); ctx.fill();
        ctx.strokeStyle = 'rgba(233,194,122,.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); roundRect(x, y, w, hh, 9); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#6f6578'; ctx.font = `600 20px ${displayFont}`; ctx.textAlign = 'center'; ctx.fillText('?', x + w / 2, y + hh / 2 + 2);
      }
      ctx.fillStyle = id ? '#e9dcc4' : '#6f6578'; ctx.textAlign = 'center';
      fitText(t('slot.' + slot), x + w / 2, y + hh - 4, w - 4, 10);
    });
    drawSeals(244, y0 + 152, h.seals, h.sealsMax);

    const cx = 456, cy = y0 + 90, r = 42;
    const m = chargeMult(h);
    const k = (m - 1) / (CHARGE_MAX - 1);
    const pre = clamp(h.chargeT / CHARGE_START, 0, 1);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (k <= 0 && pre > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pre); ctx.stroke();
    }
    if (k > 0) {
      const ready = m >= CHARGED;
      ctx.lineWidth = 9;
      ctx.strokeStyle = ready ? '#ffb36b' : '#e8d29a';
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      if (ready) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.6);
        gg.addColorStop(0, 'rgba(255,160,80,.25)'); gg.addColorStop(1, 'rgba(255,160,80,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = m >= CHARGED ? '#ffd08a' : '#f3ece0';
    ctx.font = `700 26px ${displayFont}`;
    ctx.fillText('×' + m.toFixed(1), cx, cy + 9);
    ctx.fillStyle = '#b9ae9c'; ctx.font = `500 12px ${bodyFont}`;
    ctx.fillText(m >= CHARGED ? t('hud.breaks') : t('hud.charge'), cx, cy + r + 22);

    const text = f.tipT > 0 ? f.tip : contextTip();
    ctx.fillStyle = '#d8ccb6'; ctx.textAlign = 'center';
    fitText(text, W / 2, H - 9, W - 24, 13);
  }

  // Строка текста, которая уменьшает шрифт, если не помещается в maxW
  function fitText(text, x, y, maxW, size, weight = 500) {
    ctx.font = `${weight} ${size}px ${bodyFont}`;
    const w = ctx.measureText(text).width;
    if (w > maxW) ctx.font = `${weight} ${Math.max(9, size * maxW / w).toFixed(1)}px ${bodyFont}`;
    ctx.fillText(text, x, y);
  }

  // Слоты отряда внизу боевого экрана
  function squadSlotRect(i) { const x0 = 20 + i * 72, y0 = HUD_BOTTOM + 130; return { x0, y0, x1: x0 + 66, y1: y0 + 60 }; }
  // Подсказка над портретом: при наведении мышью или после касания портрета
  function drawSquadTip() {
    let i = -1;
    if (G.slotTip && G.slotTip.until > G.time) i = G.slotTip.i;
    else if (G.hover) i = D.squad.findIndex((_, k) => inRect(squadSlotRect(k), G.hover));
    const slot = D.squad[i], id = slot && squadMember(slot);
    if (!id) return;
    const R = squadSlotRect(i), lines = [`${D.enemies[id].name} · ${t('slot.' + slot)}`, cap(bonusText(slotBonus(id, slot)))];
    ctx.save();
    ctx.font = `600 13px ${bodyFont}`;
    const w = Math.min(W - 24, Math.max(...lines.map((s) => ctx.measureText(s).width)) + 24), hh = 50;
    const x = clamp(R.x0, 12, W - 12 - w), y = R.y0 - hh - 8;
    ctx.fillStyle = 'rgba(14,10,18,.95)'; roundRect(x, y, w, hh, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(233,194,122,.6)'; ctx.lineWidth = 1; roundRect(x, y, w, hh, 10); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#e9c27a'; ctx.fillText(lines[0], x + 12, y + 20);
    ctx.fillStyle = '#d8ccb6'; ctx.font = `500 12.5px ${bodyFont}`; ctx.fillText(lines[1], x + 12, y + 39);
    ctx.restore();
  }

  function drawSeals(x0, y, n, max) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9ae9c'; ctx.font = `500 12px ${bodyFont}`;
    ctx.fillText(t('hud.seals'), x0, y);
    for (let i = 0; i < max; i++) {
      const on = i < n;
      const x = x0 + 10 + i * 28, yy = y + 18;
      ctx.beginPath(); ctx.arc(x, yy, 10, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#e9c27a' : 'rgba(255,255,255,.08)'; ctx.fill();
      ctx.strokeStyle = '#a8864a'; ctx.lineWidth = 1.5; ctx.stroke();
      if (on) { ctx.fillStyle = '#1a1208'; ctx.font = `700 11px ${displayFont}`; ctx.textAlign = 'center'; ctx.fillText('✦', x, yy + 4); ctx.textAlign = 'left'; ctx.font = `500 12px ${bodyFont}`; }
    }
  }

  function contextTip() {
    const f = fight, e = f.enemy;
    if (f.over) return '';
    if (G.auto) return t('ctx.auto');
    if (e.state === 'telegraph') return t('ctx.tel');
    if (f.vines.length) return f.hazard.short;
    if (isLastStage(e)) return f.hero.seals > 0 ? t('ctx.capture') : t('ctx.captureNoSeals');
    if (tired(e)) return t('ctx.tired');
    if (f.spheres.length >= 2) return t('ctx.spheres');
    return t('ctx.default');
  }

  function drawSwipe() {
    if (!input.down || !input.swiping || input.path.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const capturing = fighting() && isLastStage(fight.enemy) && fight.hero.seals > 0;
    const pts = capturing ? input.path : input.path.slice(-36);     // круг захвата виден целиком
    const col = capturing ? '255,214,140' : '200,240,255';
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      ctx.strokeStyle = `rgba(${col},${k})`;
      ctx.lineWidth = 2 + 10 * k;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================ ЗАБЕГ И УРОВЕНЬ
  const ROOM = {
    start:    { name: t('room.start'),    color: '#8c7d9a' },
    fight:    { name: t('room.fight'),    color: '#e2554b' },
    elite:    { name: t('room.elite'),    color: '#ff8c3a' },
    rest:     { name: t('room.rest'),     color: '#ffb347' },
    event:    { name: t('room.event'),    color: '#8fb8ff' },
    treasure: { name: t('room.treasure'), color: '#e9c27a' },
    boss:     { name: t('room.boss'),     color: '#c84cff' }
  };

  // ---------------------------------------------------------------- этаж: генерация
  // Граф как в Slay the Spire, нарисованный планом подземелья. Комнаты стоят «поясами» вдоль пути:
  // u — вдоль пути (клетки), v — поперёк (0…MAP_V). Двери бывают только между соседними поясами и только там,
  // где стены двух комнат перекрываются, — поэтому граф всегда плоский, а каждая дверь лежит на общей стене.
  const MAP_V = 12;
  const DOOR_MIN = 1.2;            // минимальное перекрытие стен (в клетках), чтобы поставить дверь
  const ROOM_MIN = 2.4;            // самая узкая комната поперёк пути
  const NO_REPEAT = ['rest', 'elite', 'treasure'];
  const pickOne = (v) => (Array.isArray(v) ? pick(v) : v);
  function weighted(keys, w) {
    let r = Math.random() * keys.reduce((s, k) => s + (w[k] || 1), 0);
    for (const k of keys) { r -= w[k] || 1; if (r <= 0) return k; }
    return keys[keys.length - 1];
  }
  const overlapV = (a, b) => Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);

  // k отрезков на [0, MAP_V], каждый не короче min
  function splitBand(k, min = ROOM_MIN) {
    const w = Array.from({ length: k }, () => Math.random());
    const sum = w.reduce((x, y) => x + y, 0), free = MAP_V - k * min;
    let v = 0;
    return w.map((x) => { const len = min + free * x / sum, r = [v, v + len]; v += len; return r; });
  }
  // Нарезка «в перевязку»: стены нового пояса стоят внутри комнат прежнего — у тех появляются развилки
  function staggeredBand(prev, k, min = ROOM_MIN) {
    const spots = prev.map((p) => [p.iv[0] + 1.55, p.iv[1] - 1.55]).filter(([a, b]) => b > a);
    if (!spots.length) return null;
    if (spots.length < k - 1) return null;
    for (let tries = 0; tries < 30; tries++) {
      // каждая стена — внутри своей комнаты прежнего пояса
      const cuts = shuffle(spots).slice(0, k - 1).map(([a, b]) => rand(a, b)).sort((x, y) => x - y);
      const pts = [0, ...cuts, MAP_V];
      if (pts.every((v, i) => !i || v - pts[i - 1] >= min)) return pts.slice(1).map((v, i) => [pts[i], v]);
    }
    return null;
  }
  // комната внутри своей клетки, с неровными отступами — между комнатами остаются просветы
  function roomRect(c, v0, v1) {
    return { u0: c.u0 + rand(0.15, 0.45), u1: c.u1 - rand(0.15, 0.45), v0: v0 + rand(0.08, 0.22), v1: v1 - rand(0.08, 0.22) };
  }

  // Пояса комнат: темница, n поясов с событиями, босс. null — не сложилось, нужна новая попытка.
  function layoutFloor(n) {
    let u = 0;
    const col = (w) => { const c = { u0: u, u1: u + w }; u += w; return c; };
    const sv0 = rand(0, 2.5), sv1 = rand(9.5, 12);
    const bands = [[{ iv: [sv0, sv1], rect: roomRect(col(rand(5, 6)), sv0, sv1) }]];
    for (let li = 0; li <= n; li++) {
      const boss = li === n, prev = bands[bands.length - 1];
      let rooms = null;
      for (let tries = 0; tries < 40 && !rooms; tries++) {
        const u0 = u;
        const c = col(boss ? rand(6, 7) : rand(3.6, 4.8));
        const k = weighted(bands.length > 1 ? [2, 3, 4] : [2, 3], { 2: 1, 3: 2.2, 4: 0.8 });   // из темницы — не больше 3 дверей
        const ivs = boss ? [[rand(0, 1.5), rand(10.5, 12)]]
          : (bands.length > 1 && Math.random() < 0.8 && staggeredBand(prev, k)) || splitBand(k);
        const cand = ivs.map(([v0, v1]) => ({ iv: [v0, v1], rect: roomRect(c, v0, v1) }));
        // у каждой комнаты должна быть дверь назад, у каждой прежней — вперёд
        const ok = cand.every((r) => prev.some((p) => overlapV(p.rect, r.rect) >= DOOR_MIN))
          && prev.every((p) => cand.some((r) => overlapV(p.rect, r.rect) >= DOOR_MIN));
        if (ok) rooms = cand; else u = u0;
      }
      if (!rooms) return null;
      bands.push(rooms);
    }
    return { bands, len: u };
  }

  // Двери между поясами A и B: у каждой комнаты A — от 1 до 3 выходов, в каждую комнату B есть вход
  function linkBands(A, B) {
    const doorable = (a, b) => overlapV(a.rect, b.rect) >= DOOR_MIN;
    const widest = (x, list) => list.reduce((m, y) => (overlapV(x.rect, y.rect) > overlapV(x.rect, m.rect) ? y : m));
    const link = (a, b) => { if (!a.next.includes(b)) a.next.push(b); };
    if (A.length === 1 || B.length === 1) {
      // из темницы — во все комнаты первого пояса, из последнего пояса — к боссу
      A.forEach((a) => B.forEach((b) => { if (doorable(a, b)) link(a, b); }));
    } else {
      A.forEach((a) => link(a, widest(a, B.filter((b) => doorable(a, b)))));
      B.forEach((b) => {
        if (!A.some((a) => a.next.includes(b))) link(widest(b, A.filter((a) => doorable(a, b))), b);
      });
      A.forEach((a) => B.forEach((b) => { if (doorable(a, b) && a.next.length < 3 && Math.random() < 0.7) link(a, b); }));
    }
    A.forEach((a) => a.next.sort((x, y) => x.i - y.i));
  }

  // Дверь на общей стене a→b: проём через просвет между комнатами
  function makeDoor(a, b) {
    const v0 = Math.max(a.rect.v0, b.rect.v0), v1 = Math.min(a.rect.v1, b.rect.v1);
    const len = Math.min(1.2, v1 - v0 - 0.3);
    const c = rand(v0 + len / 2 + 0.15, v1 - len / 2 - 0.15);
    return { ua: a.rect.u1, ub: b.rect.u0, v0: c - len / 2, v1: c + len / 2 };
  }

  // Типы комнат по поясам: правила из D.floor (weights, eliteFrom, restFrom)
  function assignRooms(layers, zoneOf) {
    const F = D.floor, n = zoneOf.length;
    const parents = (x) => (x.li === 0 ? [] : layers[x.li - 1].filter((p) => p.next.includes(x)));
    for (let li = 0; li < n; li++) {
      const num = li + 2;                               // номер комнаты на пути (темница — 1)
      for (const node of layers[li]) {
        const fixed = F.fixed && F.fixed[num];
        // привал не ставим прямо перед гарантированным привалом
        const opts = fixed ? [fixed]
          : Object.keys(F.weights).filter((k) => !(k === 'elite' && num < F.eliteFrom) && !(k === 'rest' && (num < F.restFrom || (F.fixed && F.fixed[num + 1] === 'rest'))));
        const banned = parents(node).map((p) => p.type).filter((x) => NO_REPEAT.includes(x));
        const allowed = opts.filter((x) => !banned.includes(x));
        node.type = allowed.length ? weighted(allowed, F.weights) : 'fight';
      }
    }
    if (!layers.flat().some((x) => x.type === 'elite')) {
      const c = layers.slice(0, n).flat().filter((x) => x.type === 'fight' && !(F.fixed && F.fixed[x.li + 2]) && x.li + 2 >= F.eliteFrom
        && !parents(x).some((p) => p.type === 'elite') && !x.next.some((y) => y.type === 'elite'));
      if (c.length) pick(c).type = 'elite';
    }
    for (let li = 0; li < n; li++) {
      const z = F.zones[zoneOf[li]];
      for (const node of layers[li]) {
        if (node.type === 'fight') { node.enemy = pick(z.pool); node.lvl = z.lvl; node.enemies = groupFor(node.enemy, z); }
        if (node.type === 'elite') { node.enemy = pickOne(F.elite); node.lvl = z.lvl + 1; }
      }
      // соседние бои одного пояса — разные противницы, если можно
      const fights = layers[li].filter((x) => x.type === 'fight');
      for (let k = 1; k < fights.length; k++) {
        if (fights[k].enemy !== fights[k - 1].enemy) continue;
        const pool = z.pool.filter((p) => p !== fights[k - 1].enemy);
        if (pool.length) fights[k].enemy = pick(pool);
      }
    }
    Object.assign(layers[n][0], { type: 'boss', enemy: pickOne(F.boss), lvl: F.bossLvl });
  }

  // Состав обычного боя: иногда к противнице присоединяются ещё одна-две из пула зоны
  function groupFor(first, z) {
    const [p2, p3] = z.group || [0, 0], r = Math.random();
    const n = r < p3 ? 3 : r < p3 + p2 ? 2 : 1;
    const ids = [first];
    while (ids.length < n) ids.push(pick(z.pool.filter((id) => !ids.includes(id)).concat(z.pool.length < n ? z.pool : [])));
    return ids;
  }

  function genFloor() {
    const F = D.floor;
    const zoneOf = F.zones.flatMap((z, zi) => Array(z.rooms).fill(zi));
    let lay = null;
    for (let tries = 0; tries < 500 && !lay; tries++) lay = layoutFloor(zoneOf.length);
    if (!lay) throw new Error('floor layout failed');
    const [[start], ...bands] = lay.bands;
    Object.assign(start, { type: 'start', li: -1, i: 0, next: [], visited: true, done: false });
    const layers = bands.map((B, li) => B.map((r, i) => Object.assign(r, { type: null, li, i, next: [], visited: false, done: false })));
    linkBands([start], layers[0]);
    for (let li = 0; li < layers.length - 1; li++) linkBands(layers[li], layers[li + 1]);
    for (const a of [start, ...layers.flat()]) a.doors = new Map(a.next.map((b) => [b, makeDoor(a, b)]));
    assignRooms(layers, zoneOf);
    return { name: F.name, layers, start, len: lay.len };
  }

  function startRun() {
    run = {
      floor: genFloor(),
      cur: null, path: [], scout: D.floor.scout || 1,
      hero: newRunHero(),
      captured: [], fights: 0, time: 0, events: shuffle(EVENTS.map((e) => e.id)), trans: null, doors: [], mapHits: []
    };
    run.cur = run.floor.start;
    run.path = [run.cur];
    fight = null;
    G.mode = 'map'; G.bigMap = false;
    hideAllOverlays();
    show(ui.pauseBtn);
    showPrologue();
  }

  // темница — хаб: перед подъёмом можно собрать отряд
  function showPrologue() {
    showPanel({
      kicker: t('prologue.kicker'), title: t('prologue.title'),
      text: t('prologue.text'),
      choices: [
        { title: t('prologue.go'), desc: t('prologue.goDesc'), on: () => { run.cur.done = true; hidePanel(); } },
        { title: t('prologue.squad'), desc: squadSummary(), on: () => showSquadPanel(showPrologue) }
      ]
    });
  }

  // ---------------------------------------------------------------- отряд: выбор спутниц
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function squadSummary() {
    return D.squad.map((s) => { const id = squadMember(s); return `${t('slot.' + s)}: ${id ? D.enemies[id].name : t('squad.empty')}`; }).join(' · ');
  }
  function companionLine(id) {
    return companionSlots(id).map((s) => `${t('slot.' + s).toLowerCase()} — ${bonusText(slotBonus(id, s))}`).join('; ');
  }
  // список спутниц для слота: пойманные можно выбрать, остальные видны как подсказка
  function pickCompanion(slot, back) {
    const cur = squadMember(slot);
    const ids = Object.keys(D.enemies).filter((id) => slotBonus(id, slot))
      .sort((a, b) => (save.captured[b] ? 1 : 0) - (save.captured[a] ? 1 : 0));
    const choices = ids.map((id) => {
      const caught = !!save.captured[id];
      const other = D.squad.find((s) => s !== slot && squadMember(s) === id);
      const note = !caught ? t('squad.notCaught') : other ? t('squad.inSlot', { slot: t('slot.' + other).toLowerCase() }) : '';
      return {
        title: D.enemies[id].name, desc: cap(bonusText(slotBonus(id, slot))) + (note ? ' · ' + note : ''),
        ck: id === cur ? t('squad.here') : '', disabled: !caught, on: () => { setSquad(slot, id); back(); }
      };
    });
    if (cur) choices.push({ title: t('squad.free'), on: () => { setSquad(slot, null); back(); } });
    choices.push({ title: t('squad.back'), on: back });
    showPanel({ kicker: t('squad.title'), title: t('slot.' + slot), img: cur ? D.enemies[cur].sprites[0] : null, text: ids.length ? t('squad.pickText') : t('squad.noCompanion'), choices });
  }
  function showSquadPanel(done) {
    showPanel({
      kicker: t('squad.title'), title: t('squad.title'), text: t('squad.text'),
      choices: [
        ...D.squad.map((slot) => {
          const id = squadMember(slot);
          return {
            title: `${t('slot.' + slot)}: ${id ? D.enemies[id].name : t('squad.empty')}`,
            desc: id ? cap(bonusText(slotBonus(id, slot))) : t('squad.emptyDesc'),
            on: () => pickCompanion(slot, () => showSquadPanel(done))
          };
        }),
        { title: t('squad.done'), on: done }
      ]
    });
  }

  // комнат на пути, считая темницу и босса; номер текущей (темница — 1)
  function roomCount() { return run.floor.layers.length + 1; }
  function roomNumber() { return run.cur.li + 2; }

  // двери текущей комнаты в координатах фона
  function doorSlots(n) {
    const slot = (side) => {
      if (side === 'center') {
        return { side, pts: [[282, BY1], [282, 462], [358, 462], [358, BY1]], arch: true, icon: [320, 400] };
      }
      const xs = [128, 194];
      const ys = xs.map((x) => {
        const yb = BG.h + (BY1 - BG.h) * x / BX0;
        const yt = BY0 * x / BX0;
        return { yb, yt: yb - 0.56 * (yb - yt) };
      });
      let pts = [[xs[0], ys[0].yb], [xs[0], ys[0].yt], [xs[1], ys[1].yt], [xs[1], ys[1].yb]];
      if (side === 'right') pts = pts.map(([x, y]) => [BG.w - x, y]);
      const ix = (pts[0][0] + pts[2][0]) / 2, iy = Math.min(pts[1][1], pts[2][1]) - 44;
      return { side, pts, icon: [ix, iy] };
    };
    if (n === 1) return [slot('center')];
    if (n === 2) return [slot('left'), slot('right')];
    return [slot('left'), slot('center'), slot('right')];
  }

  function updateMap(dt) {
    if (run.trans) {
      run.trans.t += dt;
      if (run.trans.t >= run.trans.dur) {
        const node = run.trans.node;
        run.trans = null;
        enterNode(node);
      }
    }
  }

  function renderMap() {
    const node = run.cur;
    const bossNode = node.type === 'boss' ? node : node.next.length === 1 && node.next[0].type === 'boss' ? node.next[0] : null;
    const theme = bossNode ? ((D.enemies[bossNode.enemy] && D.enemies[bossNode.enemy].theme) || 'spirit') : 'dungeon';
    ctx.save();
    if (run.trans) {
      const k = clamp(run.trans.t / run.trans.dur, 0, 1);
      const e = k * k;
      ctx.translate(run.trans.x, run.trans.y);
      ctx.scale(1 + 1.8 * e, 1 + 1.8 * e);
      ctx.translate(-run.trans.x, -run.trans.y);
    }
    drawBackground(theme, G.time);
    run.doors = [];
    if (node.done && !G.panelOpen) {
      const slots = doorSlots(node.next.length);
      node.next.forEach((n, i) => drawDoor(slots[i], n));
    }
    drawForeground(theme);
    ctx.restore();
    if (run.trans) {
      const k = clamp(run.trans.t / run.trans.dur, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fillRect(0, 0, W, H);
    }
    drawMapTopHud();
    drawFloorMap(G.bigMap);
  }

  function drawDoor(slot, node) {
    const R = ROOM[node.type];
    const pts = slot.pts.map(([x, y]) => [bgX(x), bgY(y)]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const box = { x0: Math.min(...xs) - 16, x1: Math.max(...xs) + 16, y0: Math.min(...ys) - 90, y1: Math.max(...ys) + 10 };
    run.doors.push({ box, node, cx: (box.x0 + box.x1) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 });
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 3 + node.i);
    ctx.save();
    // проём
    ctx.beginPath();
    if (slot.arch) {
      ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.quadraticCurveTo((pts[1][0] + pts[2][0]) / 2, pts[1][1] - 46, pts[2][0], pts[2][1]);
      ctx.lineTo(pts[3][0], pts[3][1]);
    } else {
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    }
    ctx.closePath();
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const gr = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
    gr.addColorStop(0, '#050307'); gr.addColorStop(1, hexA(R.color, 0.35 + 0.15 * pulse));
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = '#5a4532'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = hexA(R.color, 0.5 + 0.4 * pulse); ctx.lineWidth = 2; ctx.stroke();
    // свечение из проёма
    ctx.globalCompositeOperation = 'lighter';
    const g2 = ctx.createRadialGradient((box.x0 + box.x1) / 2, Math.max(...ys), 4, (box.x0 + box.x1) / 2, Math.max(...ys), 120);
    g2.addColorStop(0, hexA(R.color, 0.25 * (0.6 + 0.4 * pulse))); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.fillRect(box.x0 - 100, Math.max(...ys) - 120, box.x1 - box.x0 + 200, 200);
    ctx.globalCompositeOperation = 'source-over';
    // значок
    const ix = bgX(slot.icon[0]), iy = bgY(slot.icon[1]) - 4 * pulse;
    drawRoomIcon(node.type, ix, iy, 26);
    ctx.textAlign = 'center'; ctx.font = `600 15px ${displayFont}`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,6,12,.9)';
    const label = node.type === 'fight' || node.type === 'elite' || node.type === 'boss'
      ? t(node.enemies && node.enemies.length > 1 ? 'door.group' : 'door.lvl', { name: R.name, n: node.lvl, k: node.enemies ? node.enemies.length : 1 }) : R.name;
    ctx.strokeText(label, ix, iy + 46); ctx.fillStyle = R.color; ctx.fillText(label, ix, iy + 46);
    ctx.restore();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function drawRoomIcon(type, x, y, r, dim) {
    const R = ROOM[type];
    ctx.save();
    ctx.globalAlpha = dim ? 0.45 : 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,9,16,.92)'; ctx.fill();
    ctx.strokeStyle = R.color; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.stroke();
    ctx.translate(x, y);
    const s = r / 26;
    ctx.scale(s, s);
    ctx.strokeStyle = R.color; ctx.fillStyle = R.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (type === 'fight') {
      line(ctx, -11, -11, 11, 11); line(ctx, 11, -11, -11, 11);
      line(ctx, -14, 4, -4, 14); line(ctx, 14, 4, 4, 14);
    } else if (type === 'elite') {
      ctx.beginPath(); ctx.arc(0, 2, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, -4); ctx.quadraticCurveTo(-18, -10, -14, -18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -4); ctx.quadraticCurveTo(18, -10, 14, -18); ctx.stroke();
      ctx.fillStyle = '#120c14'; ctx.beginPath(); ctx.arc(-4, 1, 2.6, 0, Math.PI * 2); ctx.arc(4, 1, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'rest') {
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(10, -2, 6, 8); ctx.quadraticCurveTo(0, 12, -6, 8); ctx.quadraticCurveTo(-10, -2, 0, -14); ctx.fill();
      line(ctx, -12, 13, 12, 9); line(ctx, -12, 9, 12, 13);
    } else if (type === 'event') {
      ctx.font = `700 26px ${displayFont}`; ctx.textAlign = 'center'; ctx.fillText('?', 0, 9);
    } else if (type === 'treasure') {
      ctx.strokeRect(-12, -6, 24, 16); line(ctx, -12, 0, 12, 0);
      ctx.beginPath(); ctx.moveTo(-12, -6); ctx.quadraticCurveTo(0, -16, 12, -6); ctx.stroke();
      ctx.fillRect(-2.5, -2, 5, 6);
    } else if (type === 'boss') {
      ctx.beginPath(); ctx.moveTo(-13, 9); ctx.lineTo(-13, -6); ctx.lineTo(-6, 1); ctx.lineTo(0, -11); ctx.lineTo(6, 1); ctx.lineTo(13, -6); ctx.lineTo(13, 9); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeRect(-9, -11, 18, 22); line(ctx, -3, -11, -3, 11); line(ctx, 3, -11, 3, 11);
    }
    ctx.restore();
  }

  function drawMapTopHud() {
    const rh = run.hero;
    topGradient();
    ctx.textAlign = 'left'; ctx.fillStyle = '#e9c27a'; ctx.font = `600 21px ${displayFont}`;
    ctx.fillText(run.floor.name, 20, 36);
    ctx.textAlign = 'right'; ctx.fillStyle = '#b9ae9c'; ctx.font = `500 13px ${bodyFont}`;
    ctx.fillText(t('map.room', { i: roomNumber(), n: roomCount() }), W - 20, 36);

    bar(20, 48, W - 40, 15, rh.hp / rh.hpMax, rh.hp / rh.hpMax < 0.3 ? '#d9473f' : '#5fbf6a');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `600 11px ${bodyFont}`;
    ctx.fillText(t('map.hero', { lvl: rh.lvl, hp: Math.ceil(rh.hp), max: rh.hpMax }), W / 2, 60);
    const need = xpNeed(rh.lvl);
    bar(20, 69, W - 40, 7, rh.xp / need, '#9a7be0');
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9ae9c'; ctx.font = `500 11.5px ${bodyFont}`;
    ctx.fillText(t('map.xp', { xp: rh.xp, need }), 20, 92);
    drawSeals(150, 92, rh.seals, rh.sealsMax);
    ctx.textAlign = 'right'; ctx.fillStyle = '#c9b6f0';
    const names = rh.relics.map((id) => D.relics.find((r) => r.id === id).name);
    ctx.fillText(names.length ? names.slice(-2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') : t('map.noRelics'), W - 20, 92);
  }

  // ---------------------------------------------------------------- этаж: план подземелья
  // Мини-план внизу экрана (путь слева направо) и большой план по нажатию (путь снизу вверх).
  // Туман: значки видны у пройденных комнат и у тех, куда можно дойти за run.scout дверей; босс виден всегда.
  const MINI = { x: 18, y: 780, w: 504, h: 144 };
  const BIG = { x: 26, y: 176, w: 488, h: 690 };
  function mapView(big) {
    const len = run.floor.len;
    if (!big) {
      const su = MINI.w / len, sv = MINI.h / MAP_V;
      return { big, A: MINI, pt: (u, v) => [MINI.x + u * su, MINI.y + v * sv] };
    }
    const sv = BIG.w / MAP_V, su = BIG.h / len;
    return { big, A: BIG, pt: (u, v) => [BIG.x + v * sv, BIG.y + BIG.h - u * su] };
  }
  function screenRect(view, r) {
    const [ax, ay] = view.pt(r.u0, r.v0), [bx, by] = view.pt(r.u1, r.v1);
    return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  }
  const rectCenter = (r) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
  const inRect = (r, p) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
  const doorRect = (d) => ({ u0: d.ua - 0.12, u1: d.ub + 0.12, v0: d.v0, v1: d.v1 });
  function allRooms() { return [run.floor.start, ...run.floor.layers.flat()]; }

  // комнаты, чьи значки видны: пройденные и те, до которых не больше run.scout дверей от текущей
  function knownRooms() {
    const known = new Set(run.path);
    let front = [run.cur];
    for (let d = 0; d < run.scout; d++) {
      front = front.flatMap((x) => x.next);
      front.forEach((x) => known.add(x));
    }
    return known;
  }

  // Неизменная часть плана (порода, полы, стены) рисуется один раз на этаж
  function mapTexture(view) {
    const f = run.floor, key = view.big ? 'big' : 'mini', k = canvas.width / W, pad = 8, A = view.A;
    f.tex = f.tex || {};
    if (f.tex[key] && f.tex[key].k === k) return f.tex[key];
    const c = document.createElement('canvas');
    c.width = Math.ceil((A.w + pad * 2) * k); c.height = Math.ceil((A.h + pad * 2) * k);
    const g = c.getContext('2d');
    g.scale(k, k); g.translate(pad - A.x, pad - A.y);
    // скальная порода
    g.fillStyle = '#0f0c11'; g.fillRect(A.x - pad, A.y - pad, A.w + pad * 2, A.h + pad * 2);
    for (let i = 0; i < A.w * A.h / 50; i++) {
      g.fillStyle = `rgba(${randi(50, 90)},${randi(42, 70)},${randi(50, 80)},${rand(0.12, 0.4)})`;
      g.fillRect(A.x + rand(-pad, A.w + pad), A.y + rand(-pad, A.h + pad), rand(1, 3), rand(1, 2.5));
    }
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1;
    for (let i = 0; i < A.w * A.h / 3000; i++) {
      let x = A.x + rand(0, A.w), y = A.y + rand(0, A.h);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += rand(-14, 14); y += rand(-14, 14); g.lineTo(x, y); }
      g.stroke();
    }
    const tile = view.big ? 14 : 7, tw = tile * 1.6;
    for (const n of allRooms()) {
      const r = screenRect(view, n.rect), w = r.x1 - r.x0, h = r.y1 - r.y0;
      const boss = n.type === 'boss';
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(r.x0 + 2, r.y0 + 3, w, h);
      const fl = g.createLinearGradient(r.x0, r.y0, r.x1, r.y1);
      fl.addColorStop(0, boss ? '#33243f' : '#352c31'); fl.addColorStop(1, boss ? '#1d1426' : '#211b20');
      g.fillStyle = fl; g.fillRect(r.x0, r.y0, w, h);
      // плиты пола в перевязку и потёртости
      g.save(); g.beginPath(); g.rect(r.x0, r.y0, w, h); g.clip();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1;
      for (let y = r.y0, row = 0; y < r.y1; y += tile, row++) {
        if (row) line(g, r.x0, y, r.x1, y);
        for (let x = r.x0 + (row % 2 ? tw / 2 : tw) * rand(0.8, 1.1); x < r.x1; x += tw * rand(0.85, 1.15)) line(g, x, y, x, Math.min(y + tile, r.y1));
      }
      for (let i = 0; i < w * h / 90; i++) {
        g.fillStyle = `rgba(255,236,210,${rand(0.02, 0.07)})`;
        g.fillRect(rand(r.x0, r.x1), rand(r.y0, r.y1), rand(1, 4), rand(1, 2));
      }
      g.restore();
      // стены: тёмная кладка и светлая кромка
      g.strokeStyle = '#060508'; g.lineWidth = view.big ? 5 : 3.2; g.strokeRect(r.x0, r.y0, w, h);
      g.strokeStyle = '#75646c'; g.lineWidth = 1.1; g.strokeRect(r.x0 + 0.5, r.y0 + 0.5, w - 1, h - 1);
      if (boss) {
        // колонны в углах зала
        const cr = Math.max(2, Math.min(w, h) * 0.06);
        for (const [px, py] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
          g.fillStyle = '#0c0910'; g.beginPath(); g.arc(r.x0 + w * px, r.y0 + h * py, cr, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#5c4a6e'; g.lineWidth = 1; g.stroke();
        }
      }
      if (n.type === 'start') {
        // решётка темницы у дальней стены
        g.strokeStyle = 'rgba(150,140,150,.55)'; g.lineWidth = 1;
        const bx = r.x0 + w * 0.12, by = r.y0 + h * 0.1, bw = w * 0.3;
        line(g, bx, by, bx + bw, by);
        for (let x = bx; x <= bx + bw + 0.1; x += bw / 4) line(g, x, by, x, by + h * 0.18);
      }
    }
    f.tex[key] = { c, k, pad };
    return f.tex[key];
  }

  function drawFloorMap(big) {
    const view = mapView(big), A = view.A, cur = run.cur;
    const reach = cur.done && !run.trans && !G.panelOpen ? cur.next : [];
    const known = knownRooms();
    const lit = (n) => n.visited || reach.includes(n);
    if (big) {
      ctx.fillStyle = 'rgba(4,3,6,.88)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e9c27a'; ctx.font = `600 24px ${displayFont}`;
      ctx.fillText(run.floor.name, W / 2, A.y - 34);
    } else bottomPanel(738);
    const tex = mapTexture(view);
    ctx.drawImage(tex.c, A.x - tex.pad, A.y - tex.pad, A.w + tex.pad * 2, A.h + tex.pad * 2);
    ctx.strokeStyle = 'rgba(233,194,122,.3)'; ctx.lineWidth = 1.5;
    roundRect(A.x - tex.pad, A.y - tex.pad, A.w + tex.pad * 2, A.h + tex.pad * 2, 6); ctx.stroke();
    const rooms = allRooms();
    // туман: неизведанные комнаты — тёмные силуэты, пройденные чуть притушены
    for (const n of rooms) {
      if (n === cur) continue;
      const r = screenRect(view, n.rect);
      ctx.fillStyle = lit(n) ? (n.visited ? 'rgba(6,5,9,.35)' : 'rgba(0,0,0,0)') : known.has(n) ? 'rgba(6,5,9,.55)' : 'rgba(6,5,9,.82)';
      ctx.fillRect(r.x0 - 1, r.y0 - 1, r.x1 - r.x0 + 2, r.y1 - r.y0 + 2);
    }
    // факел в текущей комнате
    {
      const r = screenRect(view, cur.rect), [x, y] = rectCenter(r);
      const rad = Math.max(r.x1 - r.x0, r.y1 - r.y0) * (0.75 + 0.04 * Math.sin(G.time * 9));
      ctx.save(); ctx.beginPath(); ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(x, y, 2, x, y, rad);
      gr.addColorStop(0, 'rgba(255,170,80,.28)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = gr; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.restore();
    }
    // двери: пройденные открыты, двери из текущей комнаты светятся
    const walked = new Set(run.path.slice(1).map((b, i) => run.path[i].doors.get(b)));
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 5);
    for (const a of rooms) {
      for (const [b, d] of a.doors) {
        const r = screenRect(view, doorRect(d)), w = r.x1 - r.x0, h = r.y1 - r.y0;
        ctx.globalAlpha = lit(a) || lit(b) ? 1 : 0.4;
        if (walked.has(d)) {
          ctx.fillStyle = '#050307'; ctx.fillRect(r.x0, r.y0, w, h);
          ctx.strokeStyle = 'rgba(233,194,122,.75)'; ctx.lineWidth = 1; ctx.strokeRect(r.x0, r.y0, w, h);
        } else {
          const wood = ctx.createLinearGradient(r.x0, r.y0, r.x1, r.y1);
          wood.addColorStop(0, '#8a5d36'); wood.addColorStop(1, '#4b2f1b');
          ctx.fillStyle = wood; ctx.fillRect(r.x0, r.y0, w, h);
          ctx.strokeStyle = '#140c07'; ctx.lineWidth = 1; ctx.strokeRect(r.x0, r.y0, w, h);
        }
        if (a === cur && reach.includes(b)) {
          ctx.strokeStyle = `rgba(255,214,140,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 2;
          ctx.strokeRect(r.x0 - 2, r.y0 - 2, w + 4, h + 4);
        }
        ctx.globalAlpha = 1;
      }
    }
    // путь героя: пунктир через двери
    if (run.path.length > 1) {
      ctx.save();
      ctx.setLineDash(big ? [6, 5] : [3, 3]); ctx.strokeStyle = 'rgba(233,194,122,.75)'; ctx.lineWidth = big ? 2.5 : 1.6;
      ctx.beginPath();
      run.path.forEach((n, i) => {
        const [x, y] = rectCenter(screenRect(view, n.rect));
        if (i) { const [dx, dy] = rectCenter(screenRect(view, doorRect(run.path[i - 1].doors.get(n)))); ctx.lineTo(dx, dy); ctx.lineTo(x, y); } else ctx.moveTo(x, y);
      });
      ctx.stroke(); ctx.restore();
    }
    // значки, подсветка доступных комнат, герой
    run.mapHits = [];
    for (const n of rooms) {
      const r = screenRect(view, n.rect), [x, y] = rectCenter(r);
      const rad = clamp(Math.min(r.x1 - r.x0, r.y1 - r.y0) * 0.3, 7, big ? 20 : 12);
      if (reach.includes(n)) {
        ctx.strokeStyle = `rgba(255,214,140,${0.35 + 0.5 * pulse})`; ctx.lineWidth = 2;
        ctx.strokeRect(r.x0 + 2.5, r.y0 + 2.5, r.x1 - r.x0 - 5, r.y1 - r.y0 - 5);
        run.mapHits.push({ node: n, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
      }
      if (known.has(n) || n.type === 'boss') {
        drawRoomIcon(n.type, x, y, rad, n.visited && n !== cur);
        if (n.enemies && n.enemies.length > 1) {
          ctx.font = `700 ${big ? 13 : 9}px ${bodyFont}`; ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,6,12,.9)'; ctx.strokeText('×' + n.enemies.length, x + rad, y + rad + 2);
          ctx.fillStyle = '#ff9a7a'; ctx.fillText('×' + n.enemies.length, x + rad, y + rad + 2);
        }
      }
      if (n === cur) {
        ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, rad + 4 + Math.sin(G.time * 4) * 1.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.fillStyle = '#d8ccb6'; ctx.textAlign = 'center';
    if (big) fitText(t('map.planHint'), W / 2, A.y + A.h + 40, W - 24, 14);
    else {
      ctx.fillStyle = '#8f8494'; ctx.font = `500 10.5px ${bodyFont}`; ctx.textAlign = 'right';
      ctx.fillText(t('map.expand'), A.x + A.w + 4, A.y - 12);
      ctx.fillStyle = '#d8ccb6'; ctx.textAlign = 'center';
      fitText(cur.done ? t('map.chooseDoor') : '', W / 2, H - 9, W - 24, 13);
    }
  }

  function chooseDoor(i) {
    if (!run || run.trans || G.panelOpen || !run.cur.done) return;
    const d = run.doors[i];
    if (!d) return;
    run.trans = { t: 0, dur: 0.7, x: d.cx, y: d.cy, node: d.node };
    G.bigMap = false;
    sfx.door();
  }
  // переход в соседнюю комнату, выбранную на плане
  function chooseNode(node) {
    const i = run.doors.findIndex((d) => d.node === node);
    if (i >= 0) { chooseDoor(i); return; }
    if (!run || run.trans || G.panelOpen || !run.cur.done || !run.cur.next.includes(node)) return;
    run.trans = { t: 0, dur: 0.7, x: W / 2, y: 450, node };
    G.bigMap = false;
    sfx.door();
  }

  function mapPointer(p) {
    if (!run || run.trans || G.panelOpen) return;
    const hit = run.cur.done && run.mapHits.find((h) => inRect(h, p));
    if (G.bigMap) { G.bigMap = false; if (hit) chooseNode(hit.node); return; }
    if (hit) { chooseNode(hit.node); return; }
    if (p.y >= MINI.y - 20) { G.bigMap = true; return; }
    if (!run.cur.done) return;
    const i = run.doors.findIndex((d) => inRect(d.box, p));
    if (i >= 0) chooseDoor(i);
  }

  function enterNode(node) {
    node.visited = true;
    run.cur = node;
    run.path.push(node);
    G.bigMap = false;
    const rh = run.hero;
    switch (node.type) {
      case 'fight':
      case 'elite':
        startRunFight(node);
        break;
      case 'boss': {
        const ed = D.enemies[node.enemy];
        showPanel({
          kicker: t('boss.kicker'), title: ed.name, img: ed.sprites[0], text: ed.intro,
          choices: [{ title: t('boss.fight'), desc: ed.about, on: () => { hidePanel(); startRunFight(node); } }]
        });
        break;
      }
      case 'rest':
        showRest();
        break;
      case 'treasure': {
        const opts = relicChoices(3);
        if (!opts.length) { grantXp(40); showPanel({ kicker: t('tr.kicker'), title: t('tr.emptyTitle'), text: t('tr.emptyText'), choices: [{ title: t('next'), on: roomDone }] }); break; }
        showPanel({
          kicker: t('tr.kicker'), title: t('tr.title'), text: t('tr.text'),
          choices: opts.map((r) => ({ title: r.name, desc: r.text, cls: 'relic', ck: t('ck.relic'), on: () => { addRelic(r.id); roomDone(); } }))
        });
        break;
      }
      case 'event':
        showEvent();
        break;
    }
  }

  function roomDone() {
    run.cur.done = true;
    hidePanel();
    G.mode = runScreen();
    fight = null;
    show(ui.pauseBtn);
  }

  function startRunFight(node) {
    newFight(node.enemies || node.enemy, run.hero.lvl, node.lvl, { runHero: run.hero });
    G.mode = 'fight'; G.paused = false;
    hideAllOverlays(); show(ui.pauseBtn);
  }

  function afterRunFight() {
    const f = fight, rh = run.hero, node = run.cur;
    rh.hp = clamp(Math.round(f.hero.hp), 0, rh.hp);      // запас здоровья от отряда после боя сгорает
    rh.seals = f.hero.seals;
    run.fights++;
    run.time += f.endT;
    if (f.outcome === 'lose') { runOver(); return; }
    const res = f.results, group = f.foes.length > 1;
    res.forEach((r) => { if (r.outcome === 'captured') run.captured.push(r.id); });
    if (node.type === 'boss') { runComplete(); return; }
    const xpMul = (o) => (o === 'captured' ? 0.8 : o === 'escaped' ? 0.5 : 1);
    const xp = Math.round(res.reduce((sum, r) => sum + r.ed.xp * xpMul(r.outcome), 0));
    const lv = grantXp(xp);
    const lines = [t('reward.xp', { n: xp })];
    if (group) res.forEach((r) => lines.push(t('reward.groupLine', { name: r.ed.name, out: t('out.' + r.outcome) })));
    for (const r of res) {
      if (r.outcome !== 'captured') continue;
      lines.push(t('reward.caught', { name: r.ed.name }));
      if (companionSlots(r.id).length) lines.push(t('reward.joins', { list: companionLine(r.id) }));
    }
    if (lv) lines.push(t('reward.lvl', { n: rh.lvl }));
    lines.push('', t('reward.pick'));
    const choices = [];
    const rel = relicChoices(1)[0];
    if (rel) choices.push({ title: rel.name, desc: rel.text, cls: 'relic', ck: t('ck.relic'), on: () => { addRelic(rel.id); roomDone(); } });
    const up = pick(D.upgrades);
    choices.push({ title: up.name, desc: up.text, ck: t('ck.upgrade'), on: () => { applyUpgrade(up.id); roomDone(); } });
    if (rh.seals < 4) choices.push({ title: t('reward.seal'), desc: t('reward.sealDesc', { n: rh.seals }), ck: t('ck.seal'), on: () => { rh.seals++; rh.sealsMax = Math.max(rh.sealsMax, rh.seals); roomDone(); } });
    else choices.push({ title: t('reward.bandage'), desc: t('reward.bandageDesc'), ck: t('ck.heal'), on: () => { heal(0.3); roomDone(); } });
    G.mode = runScreen();
    hide(ui.result);
    if (lv) sfx.level();
    showPanel({ kicker: node.type === 'elite' ? t('reward.eliteKicker') : t('reward.kicker'), title: group ? t('res.group') : resultTitle(f.outcome), img: spriteFor(res[0].ed, res[0].stage), text: lines.join('\n'), choices });
  }

  function resultTitle(o) { return ['captured', 'defeated', 'escaped', 'lose'].includes(o) ? t('res.' + o) : ''; }

  function grantXp(x) {
    const rh = run.hero;
    rh.xp += x;
    let gained = 0;
    while (rh.xp >= xpNeed(rh.lvl)) {
      rh.xp -= xpNeed(rh.lvl);
      rh.lvl++;
      gained++;
      rh.hpMax += D.hero.hpPerLvl;
      rh.hp = Math.min(rh.hpMax, rh.hp + D.hero.hpPerLvl + Math.round(rh.hpMax * 0.2));
    }
    return gained;
  }
  function heal(frac) { const rh = run.hero; rh.hp = Math.min(rh.hpMax, Math.round(rh.hp + rh.hpMax * frac)); }

  function relicChoices(n) { return shuffle(D.relics.filter((r) => !run.hero.relics.includes(r.id))).slice(0, n); }
  function addRelic(id) {
    const rh = run.hero;
    rh.relics.push(id);
    if (id === 'seal') { rh.seals++; rh.sealsMax++; }
    if (id === 'heart') { rh.hpMax += 25; rh.hp += 25; }
    if (id === 'belt') rh.mods.tapCostMul *= 0.7;
  }
  function applyUpgrade(id) {
    const rh = run.hero, m = rh.mods;
    rh.upgrades.push(id);
    if (id === 'dmg') m.dmgMul *= 1.12;
    if (id === 'charge') m.chargeSpeed *= 1.2;
    if (id === 'parry') m.parryBonus += 0.08;
    if (id === 'stam') m.stamAdd += 20;
    if (id === 'regen') m.regenMul *= 1.25;
    if (id === 'hp') { rh.hpMax += 15; rh.hp = Math.min(rh.hpMax, rh.hp + 15); }
  }

  function showRest() {
    const rh = run.hero;
    const caught = Object.keys(save.captured).length;
    showPanel({
      kicker: t('rest.kicker'), title: t('rest.title'),
      text: t('rest.text', { hp: Math.ceil(rh.hp), max: rh.hpMax }),
      choices: [
        { title: t('rest.rest'), desc: t('rest.restDesc'), on: () => { heal(0.35); roomDone(); } },
        { title: t('rest.train'), desc: t('rest.trainDesc'), on: () => showUpgradePick(t('up.trainTitle'), t('up.trainText')) },
        { title: t('rest.squad'), desc: squadSummary(), on: () => showSquadPanel(showRest) },
        { title: t('rest.talk'), desc: caught ? t('rest.talkSoon') : t('rest.talkNone'), disabled: true }
      ]
    });
  }

  function showUpgradePick(title, text) {
    const ups = shuffle(D.upgrades).slice(0, 3);
    showPanel({ kicker: t('up.kicker'), title, text, choices: ups.map((u) => ({ title: u.name, desc: u.text, ck: t('ck.upgrade'), on: () => { applyUpgrade(u.id); roomDone(); } })) });
  }

  const EVENTS = [
    {
      id: 'camp', title: t('ev.camp.title'),
      text: t('ev.camp.text'),
      choices: [
        { title: t('ev.camp.search'), desc: t('ev.camp.searchDesc'), act: () => {
          if (Math.random() < 0.65) { run.hero.seals++; run.hero.sealsMax = Math.max(run.hero.sealsMax, run.hero.seals); return t('ev.camp.searchOk'); }
          run.hero.hp = Math.max(1, run.hero.hp - 12); return t('ev.camp.searchBad');
        } },
        { title: t('ev.camp.sit'), desc: t('ev.camp.sitDesc'), act: () => { heal(0.2); return t('ev.camp.sitOut'); } }
      ]
    },
    {
      id: 'cage', title: t('ev.cage.title'), img: 'bunny',
      text: t('ev.cage.text'),
      choices: [
        { title: t('ev.cage.open'), desc: t('ev.cage.openDesc'), act: () => {
          const r = relicChoices(1)[0];
          if (!r) { grantXp(40); return t('ev.cage.openNone'); }
          addRelic(r.id); return t('ev.cage.openOk', { name: r.name, text: r.text });
        } },
        { title: t('ev.cage.pass'), desc: t('ev.cage.passDesc'), act: () => t('ev.cage.passOut') }
      ]
    },
    {
      id: 'altar', title: t('ev.altar.title'),
      text: t('ev.altar.text'),
      choices: [
        { title: t('ev.altar.touch'), desc: t('ev.altar.touchDesc'), act: () => {
          run.hero.hp = Math.max(1, Math.round(run.hero.hp - run.hero.hpMax * 0.2));
          const lv = grantXp(100);
          if (lv) sfx.level();
          return t('ev.altar.touchOut') + (lv ? t('ev.altar.lvl', { n: run.hero.lvl }) : '');
        } },
        { title: t('ev.altar.leave'), desc: t('ev.altar.leaveDesc'), act: () => t('ev.altar.leaveOut') }
      ]
    },
    {
      id: 'whisper', title: t('ev.whisper.title'),
      text: t('ev.whisper.text'),
      choices: [
        { title: t('ev.whisper.bold'), desc: t('ev.whisper.boldDesc'), act: () => {
          const u = pick(D.upgrades); applyUpgrade(u.id);
          return t('ev.whisper.boldOut', { name: u.name, text: u.text });
        } },
        { title: t('ev.whisper.quiet'), desc: t('ev.whisper.quietDesc'), act: () => { heal(0.1); return t('ev.whisper.quietOut'); } }
      ]
    }
  ];

  function showEvent() {
    const id = run.events.shift() || pick(EVENTS).id;
    const ev = EVENTS.find((e) => e.id === id);
    showPanel({
      kicker: t('ev.kicker'), title: ev.title, text: ev.text, img: ev.img ? D.enemies[ev.img].sprites[0] : null,
      choices: ev.choices.map((c) => ({ title: c.title, desc: c.desc, on: () => {
        const out = c.act();
        showPanel({ kicker: t('ev.kicker'), title: ev.title, text: out, img: ev.img ? D.enemies[ev.img].sprites[0] : null, choices: [{ title: t('next'), on: roomDone }] });
      } }))
    });
  }

  function runSummaryText() {
    const rh = run.hero;
    const names = run.captured.map((id) => D.enemies[id].name);
    return [
      t('sum.time', { t: fmtTime(run.time), n: run.fights }),
      t('sum.lvl', { n: rh.lvl }),
      t('sum.caught', { list: names.length ? names.join(', ') : t('sum.nobody') }),
      t('sum.relics', { list: rh.relics.length ? rh.relics.map((id) => D.relics.find((r) => r.id === id).name).join(', ') : t('sum.none') })
    ].join('\n');
  }

  function finishRun(won) {
    save.runs.unshift({ won, lvl: run.hero.lvl, t: Math.round(run.time), caught: run.captured.length, at: Date.now() });
    save.runs = save.runs.slice(0, 5);
    writeSave();
  }

  function runComplete() {
    finishRun(true);
    G.mode = runScreen();
    hide(ui.result); hide(ui.pauseBtn);
    sfx.level();
    showPanel({
      kicker: t('win.kicker'), title: t(fight.outcome === 'captured' ? 'win.captured' : fight.outcome === 'escaped' ? 'win.escaped' : 'win.defeated', { name: fight.ed.name }), img: spriteFor(fight.ed, fight.enemy.stage),
      text: t('win.text') + '\n\n' + runSummaryText() + '\n\n' + t('win.end'),
      choices: [{ title: t('toMenu'), on: () => { run = null; toMenu(); } }]
    });
  }

  function runOver() {
    finishRun(false);
    G.mode = runScreen();
    hide(ui.result); hide(ui.pauseBtn);
    showPanel({
      kicker: t('lose.kicker'), title: t('lose.title'),
      text: t('lose.text') + '\n\n' + runSummaryText(),
      choices: [{ title: t('toMenu'), on: () => { run = null; toMenu(); } }]
    });
  }

  // ================================================================ РЕЖИМ ИССЛЕДОВАНИЯ
  // Альтернативный этаж: подземелье на клетках (комнаты и коридоры), свободное перемещение, туман.
  // Каждый шаг поднимает угрозу; чем она выше, тем вероятнее засада. Монументы лечат и снижают угрозу.
  const EXT = 24;                              // размер клетки на экране
  const T_WALL = 0, T_ROOM = 1, T_HALL = 2;
  const EX_TOP = HUD_TOP + 14, EX_BOTTOM = 906; // область, где нажатия идут в карту

  // Поиск в ширину по клеткам: расстояние от from до всех доступных
  function bfs(tiles, w, h, from, ok) {
    const dist = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h);
    let qh = 0, qt = 0;
    dist[from] = 0; q[qt++] = from;
    while (qh < qt) {
      const i = q[qh++], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) {
        if (j < 0 || dist[j] >= 0 || !ok(j)) continue;
        dist[j] = dist[i] + 1; q[qt++] = j;
      }
    }
    return dist;
  }

  function tryDungeon(X) {
    const w = X.w, h = X.h;
    const tiles = new Uint8Array(w * h), roomOf = new Int16Array(w * h).fill(-1), rooms = [];
    for (let tries = 0; tries < 900 && rooms.length < X.rooms; tries++) {
      const rw = randi(X.roomSize[0], X.roomSize[1]), rh = randi(X.roomSize[0], X.roomSize[1]);
      const x = randi(1, w - rw - 1), y = randi(1, h - rh - 1);
      if (rooms.some((r) => x < r.x + r.w + 2 && r.x < x + rw + 2 && y < r.y + r.h + 2 && r.y < y + rh + 2)) continue;
      rooms.push({ x, y, w: rw, h: rh, i: rooms.length, cx: x + (rw >> 1), cy: y + (rh >> 1) });
    }
    if (rooms.length < X.rooms - 2) return null;
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { tiles[y * w + x] = T_ROOM; roomOf[y * w + x] = r.i; }
    // коридоры: Г-образные от центра к центру, сквозь стены
    const carve = (x, y) => { if (tiles[y * w + x] === T_WALL) tiles[y * w + x] = T_HALL; };
    const corridor = (a, b) => {
      let x = a.cx, y = a.cy;
      const sx = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y); } };
      const sy = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x, y); } };
      if (Math.random() < 0.5) { sx(); sy(); } else { sy(); sx(); }
    };
    // остов — минимальное остовное дерево по расстоянию между центрами, плюс петли
    const d2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
    const tree = new Set([0]), links = [];
    while (tree.size < rooms.length) {
      let best = null;
      for (const i of tree) for (const r of rooms) if (!tree.has(r.i)) { const d = d2(rooms[i], r); if (!best || d < best.d) best = { a: rooms[i], b: r, d }; }
      tree.add(best.b.i); links.push([best.a, best.b]);
    }
    const linked = (a, b) => links.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
    for (const r of rooms) {
      if (Math.random() >= X.loops) continue;
      const near = rooms.filter((o) => o !== r && !linked(r, o)).sort((a, b) => d2(r, a) - d2(r, b))[0];
      if (near && d2(r, near) < 22 * 22) links.push([r, near]);
    }
    links.forEach(([a, b]) => corridor(a, b));
    // старт — нижняя комната, босс — самая далёкая по ходьбе
    const start = rooms.reduce((m, r) => (r.y + r.h > m.y + m.h ? r : m));
    const dist = bfs(tiles, w, h, start.cy * w + start.cx, (i) => tiles[i] !== T_WALL);
    rooms.forEach((r) => { r.dist = dist[r.cy * w + r.cx]; });
    const boss = rooms.reduce((m, r) => (r.dist > m.dist ? r : m));
    if (boss === start || boss.dist < (w + h) * 0.6) return null;
    return { w, h, tiles, roomOf, rooms, start, boss, dist };
  }
  function genDungeon() {
    for (let tries = 0; tries < 200; tries++) { const m = tryDungeon(D.explore); if (m) return m; }
    throw new Error('dungeon layout failed');
  }

  // Содержимое комнат: монументы на нужных долях пути, бои, события, сокровища, элита, босс
  function fillDungeon(m) {
    const X = D.explore, F = D.floor, objs = [];
    const prog = (r) => r.dist / m.boss.dist;
    const free = m.rooms.filter((r) => r !== m.start && r !== m.boss);
    for (const p of X.monuments) {
      const r = free.filter((x) => !x.content).sort((a, b) => Math.abs(prog(a) - p) - Math.abs(prog(b) - p))[0];
      if (r) r.content = 'monument';
    }
    for (const r of free) {
      if (!r.content) r.content = weighted(Object.keys(X.contents).filter((k) => k !== 'elite' || prog(r) >= X.eliteFrom), X.contents);
    }
    if (!free.some((r) => r.content === 'elite')) {
      // элита есть всегда: сначала из дальних боёв, иначе из любой дальней комнаты без монумента
      const far = free.filter((r) => r.content !== 'monument').sort((a, b) => prog(b) - prog(a));
      const c = far.filter((r) => r.content === 'fight' && prog(r) >= X.eliteFrom);
      (c.length ? pick(c) : far[0]).content = 'elite';
    }
    m.boss.content = 'boss';
    for (const r of m.rooms) {
      const type = r.content;
      if (!type || type === 'empty') continue;
      const o = { type, x: r.cx, y: r.cy, done: false };
      const z = zoneAt(prog(r));
      if (type === 'fight') { o.enemy = pick(z.pool); o.lvl = z.lvl; o.enemies = groupFor(o.enemy, z); }
      if (type === 'elite') { o.enemy = pickOne(F.elite); o.lvl = z.lvl + 1; }
      if (type === 'boss') { o.enemy = pickOne(F.boss); o.lvl = F.bossLvl; }
      objs.push(o);
    }
    return objs;
  }
  function zoneAt(p) { const Z = D.floor.zones; return Z[clamp(Math.floor(p * Z.length), 0, Z.length - 1)]; }

  function newRunHero() {
    return { lvl: 1, xp: 0, hpMax: D.hero.hp, hp: D.hero.hp, seals: D.hero.seals, sealsMax: D.hero.seals, mods: defaultMods(), relics: [], upgrades: [] };
  }
  // экран забега, на который возвращаемся после комнаты или боя
  function runScreen() { return run && run.mode === 'explore' ? 'explore' : 'map'; }

  function startExplore() {
    const m = genDungeon();
    const ex = {
      m, objs: fillDungeon(m), seen: new Uint8Array(m.w * m.h), walked: new Uint8Array(m.w * m.h),
      hx: m.start.cx, hy: m.start.cy, px: m.start.cx, py: m.start.cy, path: [], stepT: 0,
      threat: 0, cam: null, notes: [], ambush: null, tex: null
    };
    run = {
      mode: 'explore', ex, cur: { type: 'start', done: false }, path: [], scout: 1, hero: newRunHero(),
      captured: [], fights: 0, time: 0, events: shuffle(EVENTS.map((e) => e.id)), trans: null, doors: [], mapHits: []
    };
    ex.walked[m.start.cy * m.w + m.start.cx] = 1;
    exReveal(ex);
    fight = null;
    G.mode = 'explore';
    hideAllOverlays();
    show(ui.pauseBtn);
    showPrologue();
  }

  // Туман: в комнате открывается вся комната со стенами, в коридоре — клетки вокруг героя
  function exReveal(ex) {
    const m = ex.m, r = m.roomOf[ex.hy * m.w + ex.hx];
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < m.w && y < m.h) ex.seen[y * m.w + x] = 1; };
    if (r >= 0) { const R = m.rooms[r]; for (let y = R.y - 1; y <= R.y + R.h; y++) for (let x = R.x - 1; x <= R.x + R.w; x++) mark(x, y); }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(ex.hx + dx, ex.hy + dy);
  }
  // освещено сейчас: текущая комната или клетки рядом с героем
  function exLit(ex, x, y) {
    const m = ex.m, r = m.roomOf[ex.hy * m.w + ex.hx];
    if (r >= 0) { const R = m.rooms[r]; if (x >= R.x - 1 && x <= R.x + R.w && y >= R.y - 1 && y <= R.y + R.h) return true; }
    return Math.max(Math.abs(x - ex.hx), Math.abs(y - ex.hy)) <= 2;
  }

  // Путь к открытой клетке по открытым клеткам
  function exGoTo(tx, ty) {
    const ex = run.ex, m = ex.m, to = ty * m.w + tx, from = ex.hy * m.w + ex.hx;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !ex.seen[to] || m.tiles[to] === T_WALL || to === from) return false;
    const dist = bfs(m.tiles, m.w, m.h, to, (i) => m.tiles[i] !== T_WALL && ex.seen[i]);
    if (dist[from] < 0) return false;
    const path = [];
    for (let i = from; i !== to;) {
      const x = i % m.w;
      i = [x > 0 ? i - 1 : -1, x < m.w - 1 ? i + 1 : -1, i - m.w, i + m.w].find((j) => j >= 0 && j < m.w * m.h && dist[j] === dist[i] - 1);
      path.push(i);
    }
    ex.path = path;
    return true;
  }

  function updateExplore(dt) {
    const ex = run.ex;
    ex.notes.forEach((n) => { n.t += dt; });
    ex.notes = ex.notes.filter((n) => n.t < n.life);
    const k = Math.min(1, dt * 16);
    ex.px = lerp(ex.px, ex.hx, k); ex.py = lerp(ex.py, ex.hy, k);
    if (ex.ambush) {
      ex.ambush.t += dt;
      if (ex.ambush.t > 1.1) { const node = ex.ambush.node; ex.ambush = null; enterNode(node); }
      return;
    }
    if (!ex.path.length || G.panelOpen || !run.cur.done) return;
    ex.stepT += dt;
    if (ex.stepT < 0.11) return;
    ex.stepT = 0;
    const i = ex.path.shift(), m = ex.m;
    ex.hx = i % m.w; ex.hy = (i / m.w) | 0;
    exStep(ex, i);
  }

  // Шаг: угроза, туман, монументы рядом, содержимое клетки, засада
  function exStep(ex, i) {
    const X = D.explore, th = X.threat;
    ex.threat = Math.min(100, ex.threat + (ex.walked[i] ? th.stepKnown : th.step));
    ex.walked[i] = 1;
    exReveal(ex);
    for (const o of ex.objs) {
      if (o.type === 'monument' && !o.done && Math.max(Math.abs(o.x - ex.hx), Math.abs(o.y - ex.hy)) <= 1) useMonument(ex, o);
    }
    const o = ex.objs.find((x) => !x.done && x.type !== 'monument' && x.x === ex.hx && x.y === ex.hy);
    if (o) { ex.path = []; o.done = true; enterNode(o); return; }
    if (ex.threat >= th.from && Math.random() < th.chance * (ex.threat - th.from) / (100 - th.from)) {
      ex.path = [];
      ex.threat = Math.max(0, ex.threat - th.relief);
      ex.ambush = { t: 0, node: ambushNode(ex) };
      sfx.phase();
    }
  }

  // Засада: противницы зоны, где сейчас герой; при высокой угрозе чаще группой
  function ambushNode(ex) {
    const m = ex.m, p = clamp(m.dist[ex.hy * m.w + ex.hx] / m.boss.dist, 0, 1), z = zoneAt(p);
    const bonus = D.explore.threat.groupBonus, g = z.group || [0, 0];
    const first = pick(z.pool);
    return { type: 'fight', enemy: first, lvl: z.lvl, enemies: groupFor(first, { ...z, group: [g[0] + bonus, g[1] + bonus / 2] }) };
  }

  function useMonument(ex, o) {
    const X = D.explore, rh = run.hero;
    o.done = true;
    const before = rh.hp;
    heal(X.monument.heal);
    const th = Math.round(Math.min(ex.threat, X.monument.threat));
    ex.threat -= th;
    const hp = Math.round(rh.hp - before);
    const text = hp > 0 && th > 0 ? t('ex.monument', { hp, th }) : hp > 0 ? t('ex.monumentHp', { hp }) : th > 0 ? t('ex.monumentTh', { th }) : t('ex.monumentUsed');
    ex.notes.push({ x: o.x, y: o.y, text, t: 0, life: 2.4 });
    sfx.capture();
  }

  // ---------------------------------------------------------------- исследование: отрисовка
  function exTexture(ex) {
    const m = ex.m, k = canvas.width / W;
    if (ex.tex && ex.tex.k === k) return ex.tex.c;
    const c = document.createElement('canvas');
    c.width = Math.ceil(m.w * EXT * k); c.height = Math.ceil(m.h * EXT * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    g.fillStyle = '#0d0a0f'; g.fillRect(0, 0, m.w * EXT, m.h * EXT);
    for (let i = 0; i < m.w * m.h * 3; i++) {
      g.fillStyle = `rgba(${randi(50, 90)},${randi(42, 70)},${randi(50, 80)},${rand(0.1, 0.35)})`;
      g.fillRect(rand(0, m.w * EXT), rand(0, m.h * EXT), rand(1, 3), rand(1, 2));
    }
    const floor = (i) => i >= 0 && i < m.w * m.h && m.tiles[i] !== T_WALL;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x, px = x * EXT, py = y * EXT, tile = m.tiles[i];
        if (tile !== T_WALL) {
          const room = tile === T_ROOM, boss = room && m.rooms[m.roomOf[i]] === m.boss;
          g.fillStyle = boss ? '#2e2139' : room ? `rgb(${randi(46, 54)},${randi(38, 44)},${randi(43, 50)})` : `rgb(${randi(33, 38)},${randi(28, 32)},${randi(32, 37)})`;
          g.fillRect(px, py, EXT, EXT);
          g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1;
          g.strokeRect(px + 0.5, py + 0.5, EXT - 1, EXT - 1);
          if (room && (x + y) % 2) { g.fillStyle = 'rgba(255,236,210,.03)'; g.fillRect(px + 2, py + 2, EXT - 4, EXT - 4); }
          for (let s = 0; s < 3; s++) { g.fillStyle = `rgba(255,236,210,${rand(0.02, 0.06)})`; g.fillRect(px + rand(2, EXT - 4), py + rand(2, EXT - 4), rand(1, 3), 1); }
        } else if ([i - 1, i + 1, i - m.w, i + m.w, i - m.w - 1, i - m.w + 1, i + m.w - 1, i + m.w + 1].some((j) => floor(j) && Math.abs((j % m.w) - x) <= 1)) {
          // стена у прохода: каменный блок с освещённой кромкой
          g.fillStyle = '#2c242b'; g.fillRect(px, py, EXT, EXT);
          g.fillStyle = '#463a43'; g.fillRect(px, py, EXT, 4);
          g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(px, py + EXT - 3, EXT, 3);
          g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1;
          line(g, px + (y % 2 ? EXT / 2 : 0), py + 4, px + (y % 2 ? EXT / 2 : 0), py + EXT);
          line(g, px, py + EXT / 2 + 2, px + EXT, py + EXT / 2 + 2);
        }
      }
    }
    ex.tex = { c, k };
    return c;
  }

  function drawMonument(x, y, used) {
    ctx.save();
    if (!used) {
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.8 + 0.2 * Math.sin(G.time * 3);
      const gr = ctx.createRadialGradient(x, y, 2, x, y, 46 * p);
      gr.addColorStop(0, 'rgba(120,220,255,.45)'); gr.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 46 * p, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = used ? '#4a4450' : '#cfefff'; ctx.strokeStyle = '#0a0810'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 17); ctx.lineTo(x + 6, y - 9); ctx.lineTo(x + 5, y + 8); ctx.lineTo(x - 5, y + 8); ctx.lineTo(x - 6, y - 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = used ? '#38333d' : '#5d6f7d'; ctx.fillRect(x - 9, y + 8, 18, 5); ctx.strokeRect(x - 9, y + 8, 18, 5);
    if (!used) { ctx.fillStyle = '#6fd6ff'; ctx.fillRect(x - 1.5, y - 8, 3, 9); }
    ctx.restore();
  }

  function renderExplore() {
    const ex = run.ex, m = ex.m;
    const tx = ex.px * EXT + EXT / 2, ty = ex.py * EXT + EXT / 2;
    const want = { x: clamp(tx - W / 2, -60, m.w * EXT - W + 60), y: clamp(ty - 520, -140, m.h * EXT - H + 120) };
    ex.cam = ex.cam ? { x: lerp(ex.cam.x, want.x, 0.12), y: lerp(ex.cam.y, want.y, 0.12) } : want;
    const cx = Math.round(ex.cam.x), cy = Math.round(ex.cam.y);
    ctx.fillStyle = '#050307'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-cx, -cy);
    ctx.drawImage(exTexture(ex), 0, 0, m.w * EXT, m.h * EXT);
    // туман
    const x0 = Math.max(0, Math.floor(cx / EXT)), x1 = Math.min(m.w - 1, Math.ceil((cx + W) / EXT));
    const y0 = Math.max(0, Math.floor(cy / EXT)), y1 = Math.min(m.h - 1, Math.ceil((cy + H) / EXT));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * m.w + x;
        if (!ex.seen[i]) { ctx.fillStyle = '#050307'; ctx.fillRect(x * EXT, y * EXT, EXT, EXT); }
        else if (!exLit(ex, x, y)) { ctx.fillStyle = 'rgba(5,3,7,.38)'; ctx.fillRect(x * EXT, y * EXT, EXT, EXT); }
      }
    }
    // путь
    if (ex.path.length) {
      ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(233,194,122,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      for (const i of ex.path) ctx.lineTo((i % m.w) * EXT + EXT / 2, ((i / m.w) | 0) * EXT + EXT / 2);
      ctx.stroke(); ctx.restore();
    }
    // монументы и содержимое комнат — только открытое
    for (const o of ex.objs) {
      if (!ex.seen[o.y * m.w + o.x]) continue;
      const ox = o.x * EXT + EXT / 2, oy = o.y * EXT + EXT / 2;
      if (o.type === 'monument') drawMonument(ox, oy, o.done);
      else if (!o.done) {
        drawRoomIcon(o.type, ox, oy, 13);
        if (o.enemies && o.enemies.length > 1) {
          ctx.font = `700 11px ${bodyFont}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,6,12,.9)';
          ctx.strokeText('×' + o.enemies.length, ox + 13, oy + 16); ctx.fillStyle = '#ff9a7a'; ctx.fillText('×' + o.enemies.length, ox + 13, oy + 16);
        }
      }
    }
    // герой с факелом
    ctx.globalCompositeOperation = 'lighter';
    const fl = 1 + 0.05 * Math.sin(G.time * 11);
    const gr = ctx.createRadialGradient(tx, ty, 4, tx, ty, 110 * fl);
    gr.addColorStop(0, 'rgba(255,170,80,.32)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = gr; ctx.fillRect(tx - 120, ty - 120, 240, 240);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#e9c27a'; ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(tx - 2, ty - 2, 3, 0, Math.PI * 2); ctx.fill();
    // всплывающие надписи
    ctx.textAlign = 'center'; ctx.font = `700 15px ${bodyFont}`;
    for (const n of ex.notes) {
      const k = n.t / n.life, y = n.y * EXT - 18 - k * 30;
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,6,12,.9)'; ctx.strokeText(n.text, n.x * EXT + EXT / 2, y);
      ctx.fillStyle = '#9fe8ff'; ctx.fillText(n.text, n.x * EXT + EXT / 2, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const v = ctx.createRadialGradient(W / 2, 500, 240, W / 2, 500, 640);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    drawExploreHud(ex);
    if (ex.ambush) {
      const a = clamp(ex.ambush.t / 0.25, 0, 1);
      ctx.fillStyle = `rgba(120,10,10,${0.35 * a})`; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.fillStyle = '#ff9a7a'; ctx.font = `700 46px ${displayFont}`;
      ctx.fillText(t('ex.ambush'), W / 2, 470);
      ctx.fillStyle = '#f3ece0'; ctx.font = `500 15px ${bodyFont}`;
      ctx.fillText(t('ex.ambushSub'), W / 2, 502);
      ctx.globalAlpha = 1;
    }
  }

  function drawExploreHud(ex) {
    const rh = run.hero;
    topGradient();
    ctx.textAlign = 'left'; ctx.fillStyle = '#e9c27a'; ctx.font = `600 21px ${displayFont}`;
    ctx.fillText(D.explore.name, 20, 36);
    bar(20, 48, W - 40, 15, rh.hp / rh.hpMax, rh.hp / rh.hpMax < 0.3 ? '#d9473f' : '#5fbf6a');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `600 11px ${bodyFont}`;
    ctx.fillText(t('map.hero', { lvl: rh.lvl, hp: Math.ceil(rh.hp), max: rh.hpMax }), W / 2, 60);
    // угроза: зелёная → оранжевая → красная
    const k = ex.threat / 100;
    const col = k < 0.3 ? '#6fbf6a' : k < 0.65 ? '#e8a23a' : `rgba(226,${70 + 40 * Math.sin(G.time * 8)},60,1)`;
    bar(20, 70, W - 190, 10, k, col);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(20 + (W - 190) * D.explore.threat.from / 100, 67, 2, 16);
    ctx.textAlign = 'left'; ctx.font = `600 12px ${bodyFont}`; ctx.fillStyle = k >= D.explore.threat.from / 100 ? '#ffb070' : '#b9ae9c';
    ctx.fillText(`${t('ex.threat')} ${Math.round(ex.threat)}`, 20, 98);
    ctx.fillStyle = '#b9ae9c';
    ctx.fillText(t('map.xp', { xp: rh.xp, need: xpNeed(rh.lvl) }), 120, 98);
    drawSeals(W - 160, 82, rh.seals, rh.sealsMax);
    const g = ctx.createLinearGradient(0, H - 70, 0, H);
    g.addColorStop(0, 'rgba(8,6,12,0)'); g.addColorStop(1, 'rgba(8,6,12,.95)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 70, W, 70);
    ctx.fillStyle = '#d8ccb6'; ctx.textAlign = 'center';
    fitText(t(ex.threat >= 70 ? 'ex.hintHigh' : 'ex.hint'), W / 2, H - 12, W - 24, 13);
  }

  function explorePointer(p) {
    const ex = run.ex;
    if (G.panelOpen || ex.ambush || !run.cur.done || p.y < EX_TOP || p.y > EX_BOTTOM) return;
    const cam = ex.cam || { x: 0, y: 0 };
    exGoTo(Math.floor((p.x + cam.x) / EXT), Math.floor((p.y + cam.y) / EXT));
  }

  // ---------------------------------------------------------------- ввод
  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }
  function onPress(p, id) {
    if (G.paused) return false;
    if (G.mode === 'map') { mapPointer(p); return false; }
    if (G.mode === 'explore') { if (run) explorePointer(p); return false; }
    if (G.mode !== 'fight' || !fight || input.down) return false;
    // касание портрета спутницы показывает её бонус и не считается ударом
    const si = D.squad.findIndex((s, k) => squadMember(s) && inRect(squadSlotRect(k), p));
    if (si >= 0) { G.slotTip = { i: si, until: G.time + 2.5 }; return false; }
    if (G.auto) return false;      // при автобое касания не мешают компьютеру
    input.down = true; input.id = id;
    input.x = input.sx = p.x; input.y = input.sy = p.y;
    input.downT = fight.t; input.downReal = performance.now();
    input.path = [{ x: p.x, y: p.y }];
    input.swiping = false; input.guardPress = false;
    // нажатие в круг удара во время замаха — защита, а не удар
    if (!fight.over && fight.enemy.state === 'telegraph' && inGuardCircle(p)) { input.guardPress = true; guardPress(); }
    return true;
  }
  function onMove(p, id) {
    G.hover = p;
    BG.tx = clamp((p.x / W - 0.5) * 2, -1, 1);
    BG.ty = clamp((p.y / H - 0.5) * 2, -1, 1);
    if (!input.down || id !== input.id) return;
    input.x = p.x; input.y = p.y;
    const last = input.path[input.path.length - 1];
    if (dist(p.x, p.y, last.x, last.y) > 4) input.path.push({ x: p.x, y: p.y });
    if (!input.swiping && dist(p.x, p.y, input.sx, input.sy) > SWIPE_DIST) input.swiping = true;
  }
  function onRelease(id) {
    if (!input.down || id !== input.id) return;
    const dur = (performance.now() - input.downReal) / 1000;
    const path = input.path;
    const swiping = input.swiping, guarded = input.guardPress;
    input.down = false; input.id = null; input.swiping = false; input.guardPress = false;
    if (!fight || G.paused) return;
    if (swiping) resolveSwipe(path);          // росчерк по кругу удара урона не наносит (см. resolveSwipe)
    else if (!guarded && dur < TAP_MAX) heroTap(input.sx, input.sy);
  }
  canvas.addEventListener('pointerdown', (ev) => {
    sfx.ensure();
    if (onPress(toLogical(ev), ev.pointerId)) {
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
  });
  canvas.addEventListener('pointermove', (ev) => onMove(toLogical(ev), ev.pointerId));
  canvas.addEventListener('pointerup', (ev) => onRelease(ev.pointerId));
  canvas.addEventListener('pointercancel', (ev) => onRelease(ev.pointerId));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- интерфейс
  const ui = {
    loading: $('#loading'), menu: $('#menu'), result: $('#result'), pause: $('#pause'), pauseBtn: $('#pauseBtn'), panel: $('#panel'), autoBtn: $('#autoBtn')
  };
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function hideAllOverlays() { [ui.menu, ui.result, ui.pause, ui.panel].forEach(hide); G.panelOpen = false; }

  function showPanel(o) {
    $('#pKicker').textContent = o.kicker || '';
    $('#pTitle').textContent = o.title || '';
    $('#pText').textContent = o.text || '';
    const img = $('#pImg');
    if (o.img) { img.src = o.img; img.parentElement.classList.remove('hidden'); } else { img.removeAttribute('src'); img.parentElement.classList.add('hidden'); }
    const box = $('#pChoices');
    box.innerHTML = '';
    for (const c of o.choices || []) {
      const b = document.createElement('button');
      b.className = 'choice' + (c.cls ? ' ' + c.cls : '');
      if (c.disabled) b.disabled = true;
      b.innerHTML = `${c.ck ? `<i class="ck">${c.ck}</i>` : ''}<b></b>${c.desc ? '<span></span>' : ''}`;
      b.querySelector('b').textContent = c.title;
      if (c.desc) b.querySelector('span').textContent = c.desc;
      b.addEventListener('click', () => { if (!c.disabled && c.on) { sfx.ensure(); c.on(); } });
      box.appendChild(b);
    }
    show(ui.panel);
    hide(ui.pauseBtn);
    G.panelOpen = true;
    ui.panel.scrollTop = 0;
  }
  function hidePanel() { hide(ui.panel); G.panelOpen = false; if (run) show(ui.pauseBtn); }

  function buildMenu() {
    const cards = $('#cards');
    cards.innerHTML = '';
    for (const [id, e] of Object.entries(D.enemies)) {
      const b = document.createElement('button');
      b.className = 'card' + (G.selected === id ? ' sel' : '');
      const kind = e.kind === 'boss' ? t('kind.boss') : e.kind === 'elite' ? t('kind.elite') : '';
      b.innerHTML = `
        <div class="portrait"><img src="${e.sprites[0]}" alt=""></div>
        ${kind ? `<div class="badge kind">${kind}</div>` : ''}
        ${save.captured[id] ? `<div class="badge">${t('menu.caught')}</div>` : ''}
        <div class="info"><div class="name">${e.name}</div><div class="tag">${e.subtitle}${e.custom ? t('menu.custom') : ''}</div><div class="about">${e.about}</div>${companionSlots(id).length ? `<div class="tag">${t('squad.cardLine', { list: companionLine(id) })}</div>` : ''}</div>`;
      b.addEventListener('click', () => { G.selected = id; buildMenu(); });
      cards.appendChild(b);
    }
    const sq = $('#squad');
    sq.innerHTML = '';
    for (const slot of D.squad) {
      const id = squadMember(slot), e = id && D.enemies[id];
      const b = document.createElement('button');
      b.className = 'slot' + (id ? ' on' : '');
      if (e) b.title = `${e.name} · ${t('slot.' + slot)}: ${bonusText(slotBonus(id, slot))}`;
      b.innerHTML = `<div class="portrait">${e ? `<div class="face" style="${portraitStyle(id, 1.6)}"></div>` : '<span class="q">?</span>'}</div>
        <div class="sl">${t('slot.' + slot)}</div><div class="nm">${e ? e.name : t('squad.empty')}</div><div class="bn">${e ? cap(bonusText(slotBonus(id, slot))) : ''}</div>`;
      b.addEventListener('click', () => { sfx.ensure(); pickCompanion(slot, () => { hidePanel(); buildMenu(); }); });
      sq.appendChild(b);
    }
    $('#lvHero').textContent = G.heroLvl;
    $('#lvEnemy').textContent = G.enemyLvl;
    const d = G.heroLvl - G.enemyLvl;
    const boss = D.enemies[G.selected].kind === 'boss';
    if (boss) G.count = 1;            // босс сражается один
    $('#lvCount').textContent = G.count;
    $('#lvHint').textContent = G.count > 1 ? t('hint.group', { n: G.count })
      : boss ? t('hint.boss')
      : d === 0 ? t('hint.equal')
      : d > 0 ? t('hint.stronger', { n: d })
      : t('hint.weaker', { n: -d });
    const outName = (o) => (['captured', 'finished', 'defeated', 'escaped', 'lose', 'group'].includes(o) ? t('out.' + o) : o);
    const log = $('#log');
    log.innerHTML = save.fights.length ? '' : `<div><span>${t('log.empty')}</span></div>`;
    for (const r of save.fights) {
      const row = document.createElement('div');
      const who = (r.ids || [r.id]).map((id) => (D.enemies[id] ? D.enemies[id].name : id)).join(' + ');
      row.innerHTML = `<span>${who} · ${r.h} / ${r.e}${r.run ? t('log.run') : ''}</span><span>${fmtTime(r.t)} · ${outName(r.o)}</span>`;
      log.appendChild(row);
    }
    const col = $('#collection');
    const caught = Object.entries(save.captured);
    col.innerHTML = caught.length ? '' : `<div><span>${t('col.empty')}</span></div>`;
    for (const [id, c] of caught) {
      if (!D.enemies[id]) continue;
      const row = document.createElement('div');
      const slots = companionSlots(id).map((s) => t('slot.' + s).toLowerCase()).join(', ');
      row.innerHTML = `<span>${D.enemies[id].name}${slots ? ` · ${slots}` : ''}</span><span>${t('lvl', { n: c.lvl })}${c.times > 1 ? t('col.times', { n: c.times }) : ''}</span>`;
      col.appendChild(row);
    }
    $('#soundBtn').textContent = t(sfx.muted ? 'sound.off' : 'sound.on');
    $('#pauseSoundBtn').textContent = t(sfx.muted ? 'sound.off' : 'sound.on');
  }

  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const [who, d] = b.dataset.step.split(':');
    const key = who === 'hero' ? 'heroLvl' : who === 'count' ? 'count' : 'enemyLvl';
    G[key] = clamp(G[key] + Number(d), 1, key === 'count' ? 3 : 10);
    buildMenu();
  }));
  $('#runBtn').addEventListener('click', () => { sfx.ensure(); startRun(); });
  $('#exploreBtn').addEventListener('click', () => { sfx.ensure(); startExplore(); });
  $('#startBtn').addEventListener('click', () => { sfx.ensure(); startTraining(); });
  $('#againBtn').addEventListener('click', () => { sfx.ensure(); startTraining(); });
  $('#nextBtn').addEventListener('click', () => { sfx.ensure(); afterRunFight(); });
  $('#menuBtn').addEventListener('click', () => {
    if (G.returnTo === 'editor' && window.CDEditor) { G.returnTo = null; toMenu(); window.CDEditor.open(); }
    else toMenu();
  });
  $('#quitBtn').addEventListener('click', () => {
    if (run && !confirm(t('confirm.quit'))) return;
    G.paused = false; hide(ui.pause); run = null; toMenu();
    if (G.returnTo === 'editor' && window.CDEditor) { G.returnTo = null; window.CDEditor.open(); }
  });
  ui.autoBtn.addEventListener('click', () => {
    sfx.ensure();
    G.auto = !G.auto;
    if (fight) { fight.autoGuard = false; fight.autoPlan = null; }
    resetInput();
  });
  $('#resumeBtn').addEventListener('click', () => { G.paused = false; hide(ui.pause); });
  ui.pauseBtn.addEventListener('click', () => { if ((G.mode === 'fight' && !fight.over) || G.mode === 'map' || G.mode === 'explore') { G.paused = true; resetInput(); buildMenu(); show(ui.pause); } });
  $('#soundBtn').addEventListener('click', () => { sfx.toggle(); buildMenu(); });
  $('#langBtn').addEventListener('click', () => { const L = window.I18N.langs; window.I18N.setLang(L[(L.indexOf(window.I18N.lang) + 1) % L.length]); });
  $('#pauseSoundBtn').addEventListener('click', () => { sfx.toggle(); buildMenu(); });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm(t('confirm.reset'))) return;
    save = { captured: {}, fights: [], runs: [], muted: sfx.muted, squad: emptySquad() }; writeSave(); buildMenu();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'fight' && fight && !fight.over) { G.paused = true; resetInput(); buildMenu(); show(ui.pause); }
  });

  function startTraining() {
    run = null;
    // в группе к выбранной добавляются случайные обычные противницы
    const others = Object.keys(D.enemies).filter((id) => id !== G.selected && D.enemies[id].kind !== 'boss');
    const ids = [G.selected];
    while (ids.length < G.count && others.length) ids.push(pick(others.filter((id) => !ids.includes(id)).concat(others.length < G.count ? others : [])));
    newFight(ids, G.heroLvl, G.enemyLvl);
    G.mode = 'fight'; G.paused = false;
    hideAllOverlays(); show(ui.pauseBtn);
  }
  function toMenu() {
    G.mode = 'menu'; fight = null;
    hideAllOverlays(); hide(ui.pauseBtn); buildMenu(); show(ui.menu);
    ui.menu.scrollTop = 0;
  }

  function showResult() {
    const f = fight, s = f.stats, h = f.hero, e = f.enemy, ed = f.ed;
    G.mode = 'result';
    hide(ui.pauseBtn);
    const group = f.foes.length > 1;
    const gold = f.results.reduce((sum, r) => sum + Math.round((40 + 12 * r.lvl) * (r.outcome === 'escaped' ? 0.5 : 1)), 0);
    $('#resTitle').textContent = group && f.outcome !== 'lose' ? t('res.group') : resultTitle(f.outcome);
    $('#resTitle').className = f.outcome === 'lose' ? 'bad' : '';
    $('#resSub').textContent = group && f.outcome !== 'lose'
      ? f.results.map((r) => t('reward.groupLine', { name: r.ed.name, out: t('out.' + r.outcome) })).join(' · ') + '. ' + t('res.group.sub', { gold })
      : t(`res.${f.outcome}.sub`, { name: ed.name, gold });
    const dur = f.endT;
    const d = h.lvl - e.lvl, n = f.foes.length;
    const [lo, hi] = (e.kind === 'boss' ? [180, 300] : d === 0 ? [25, 60] : d > 0 ? [10, 25] : [60, 120]).map((v) => Math.round(v * (n > 1 ? n * 0.85 : 1)));
    const cls = dur < lo ? 'warn' : dur > hi ? 'bad' : 'ok';
    const verdict = t(dur < lo ? 'res.fast' : dur > hi ? 'res.slow' : 'res.ok');
    const items = [
      [t('st.time'), `<span class="${cls}">${fmtTime(dur)}</span>`, t('res.target', { lo: fmtTime(lo), hi: fmtTime(hi), v: verdict }), true],
      [t('st.taps'), s.taps], [t('st.slashes'), s.slashes],
      [t('st.parries'), s.parries], [t('st.blocks'), s.blocks],
      [t('st.links'), s.links], [t('st.breaks'), `${s.breaks} / ${f.foes.reduce((sum, x) => sum + x.enemy.parts, 0)}`],
      [t('st.combo'), h.maxCombo], [t('st.taken'), Math.round(s.taken)]
    ];
    if (s.vines) items.push([f.hazard.stat, s.vines]);
    if (s.captureTries) items.push([t('st.captures'), `${s.captures} / ${s.captureTries}`]);
    $('#resStats').innerHTML = items.map(([k, v, note, wide]) =>
      `<div class="stat${wide ? ' wide' : ''}"><div class="k">${k}</div><div class="v">${v}${note ? ` <span style="font-size:.6em;color:var(--ink-dim)">${note}</span>` : ''}</div></div>`).join('');
    const inRun = f.inRun && run;
    $('#nextBtn').classList.toggle('hidden', !inRun);
    $('#nextBtn').textContent = t(f.outcome === 'lose' ? 'res.toRun' : 'res.next');
    $('#againBtn').classList.toggle('hidden', !!inRun);
    $('#menuBtn').classList.toggle('hidden', !!inRun);
    show(ui.result);
    ui.result.scrollTop = 0;
  }

  // ---------------------------------------------------------------- цикл
  function update(dt) {
    G.time += dt;
    if (G.mode === 'fight' && fight) updateFight(dt);
    else if (G.mode === 'map' && run) updateMap(dt);
    else if (G.mode === 'explore' && run) updateExplore(dt);
  }
  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!BG.themes.dungeon) return;
    if ((G.mode === 'fight' || G.mode === 'result') && fight) renderFight();
    else if (G.mode === 'map' && run) renderMap();
    else if (G.mode === 'explore' && run) renderExplore();
    else { drawBackground('dungeon', G.time); drawForeground('dungeon'); }
    if (G.speed > 1) {
      ctx.textAlign = 'left'; ctx.font = `700 13px ${bodyFont}`; ctx.fillStyle = '#ffd060';
      ctx.fillText('▶▶ ×' + G.speed, 12, H - 30);
    }
  }
  let last = performance.now();
  // кнопка автобоя видна только в идущем бою
  let autoShown = null;
  function syncAutoBtn() {
    const vis = G.mode === 'fight' && fight && !fight.over && !G.paused && !G.panelOpen;
    if (vis !== autoShown) { autoShown = vis; ui.autoBtn.classList.toggle('hidden', !vis); }
    ui.autoBtn.classList.toggle('on', !!G.auto);
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    syncAutoBtn();
    if (!G.paused) for (let i = 0; i < G.speed; i++) update(dt);      // ускоренный режим — несколько шагов за кадр
    render();
    requestAnimationFrame(frame);
  }

  async function boot() {
    resize();
    buildTheme('dungeon');
    buildTheme('jungle');
    buildTheme('spirit');
    requestAnimationFrame(frame);
    // свои противницы из редактора (хранятся в браузере)
    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    if (window.CDEditor) { try { await window.CDEditor.loadCustom(); } catch (e) { console.warn('Custom opponents failed to load', e); } }
    try {
      await loadAssets();
    } catch (err) {
      ui.loading.innerHTML = `${t('err.sprites')}<div class="err">${err.message}.<br>${t('err.spritesHint')}</div>`;
      return;
    }
    hide(ui.loading);
    G.mode = 'menu';
    buildMenu();
    show(ui.menu);
  }

  // ---------------------------------------------------------------- API для редактора противниц
  D.floor.elite = [].concat(D.floor.elite);
  D.floor.boss = [].concat(D.floor.boss);
  const BUILTIN = new Set(Object.keys(D.enemies));
  function removeFromFloor(id) {
    D.floor.zones.forEach((z) => { z.pool = z.pool.filter((x) => x !== id); });
    D.floor.elite = D.floor.elite.filter((x) => x !== id);
    D.floor.boss = D.floor.boss.filter((x) => x !== id);
  }
  // fl.zones — номера зон этажа; у старых сохранений редактора были fl.layers (слои прежнего этажа)
  function floorZones(fl) {
    if (fl.zones) return fl.zones;
    return (fl.layers || []).map((i) => Math.min(i === 2 ? 1 : i, D.floor.zones.length - 1));
  }
  function applyFloor(id, fl = {}) {
    removeFromFloor(id);
    floorZones(fl).forEach((i) => { const z = D.floor.zones[i]; if (z && !z.pool.includes(id)) z.pool.push(id); });
    if (fl.elite) D.floor.elite.push(id);
    if (fl.boss) D.floor.boss.push(id);
  }
  async function registerEnemy(id, data) {
    const stages = [];
    for (const src of data.sprites) {
      const img = await loadImage(src);
      stages.push({ img, white: tinted(img, '#ffffff'), red: tinted(img, '#ff2a2a'), dark: tinted(img, '#0a0610'), w: img.naturalWidth, h: img.naturalHeight });
    }
    assets[id] = { stages };
    D.enemies[id] = data;
    applyFloor(id, data.floor);
  }
  function unregisterEnemy(id) {
    if (BUILTIN.has(id)) return;
    delete D.enemies[id]; delete assets[id];
    removeFromFloor(id);
    if (G.selected === id) G.selected = Object.keys(D.enemies)[0];
  }
  window.CD = {
    D, G, sfx, ui, show, hide, isBuiltin: (id) => BUILTIN.has(id),
    registerEnemy, unregisterEnemy, applyFloor, floorZones,
    hideAll: hideAllOverlays, toMenu, buildMenu,
    startTraining: (id, h, e) => { G.selected = id; G.heroLvl = h; G.enemyLvl = e; G.count = 1; startTraining(); }
  };

  // хук для автотестов и отладки
  window.__proto = {
    G, input, ui,
    get fight() { return fight; }, get run() { return run; },
    startFight: startTraining, startRun, startExplore, genDungeon, exGoTo,
    fightWith: (ids, h = 1, e = 1) => { run = null; newFight(ids, h, e); G.mode = 'fight'; G.paused = false; hideAllOverlays(); show(ui.pauseBtn); }, chooseDoor, chooseNode, genFloor, heroTap, resolveSwipe,
    press: (x, y) => onPress({ x, y }, 99), move: (x, y) => onMove({ x, y }, 99), release: () => onRelease(99),
    // начертить круг жестом (как пальцем): центр, радиус, доля оборота
    circle: (cx, cy, r, turns = 1.05) => {
      const n = Math.max(24, Math.round(r * turns / 3));
      onPress({ x: cx + r, y: cy }, 99);
      for (let i = 1; i <= n; i++) { const a = i / n * turns * Math.PI * 2; onMove({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }, 99); }
      onRelease(99);
    },
    captureChance: () => (fight ? captureChance(fight.enemy) : 0),
    guardCenter: () => guardCenter(),
    setAuto: (v) => { G.auto = !!v; },
    portraitSpot: (id) => { delete portraitCache[id]; return portraitSpot(id); },
    // ускорение: setSpeed(n) — n шагов логики за кадр; fastForward(сек) — сразу прокрутить игровое время
    // без отрисовки (останавливается, когда бой закончился и показаны итоги)
    setSpeed: (n) => { G.speed = clamp(Math.round(n) || 1, 1, 16); },
    fastForward: (sec, step = 1 / 60) => {
      let done = 0;
      for (; done < sec; done += step) {
        update(step);
        if (G.mode === 'fight' && fight && fight.resultShown) break;
      }
      return done;
    },
    next: afterRunFight
  };
  boot();
})();
