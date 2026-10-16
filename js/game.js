// Проклятое подземелье — прототип v0.2. Чистый JavaScript + Canvas 2D, без фреймворков.
// Логическое разрешение 540×960 (вертикальный экран), масштабируется под окно.
'use strict';
(function () {
  const W = 540, H = 960;
  const D = window.GAME_DATA;
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
  const CAPTURE_TIME = 1.5;
  const SUBDUE_WINDOW = 3.0;
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
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.captured) { s.fights = s.fights || []; s.runs = s.runs || []; return s; }
    } catch (e) { /* хранилище недоступно */ }
    return { captured: {}, fights: [], runs: [], muted: false };
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
      i.onerror = () => rej(new Error('Не удалось загрузить ' + src));
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
  const G = { mode: 'loading', paused: false, panelOpen: false, time: 0, selected: 'miko', heroLvl: 1, enemyLvl: 1 };
  let fight = null;
  let run = null;
  const input = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, downT: 0, downReal: 0, path: [], swiping: false, guardPress: false, lastTapT: -9 };

  // Частей брони задаётся в данных (armor); иначе — на одну меньше, чем спрайтов
  function armorParts(ed, nSprites) { return ed.armor ? ed.armor : Math.max(1, nSprites - 1); }
  // Какой спрайт показывать при данном числе сломанных частей
  function spriteIndex(nSprites, broken, parts) { return nSprites <= 1 ? 0 : Math.min(nSprites - 1, Math.floor(broken * (nSprites - 1) / Math.max(1, parts))); }
  function spriteFor(ed, broken) { return ed.sprites[spriteIndex(ed.sprites.length, broken, armorParts(ed, ed.sprites.length))]; }
  function levelMod(attackerLvl, defenderLvl) { return Math.pow(D.levelDiffFactor, attackerLvl - defenderLvl); }
  function defaultMods() { return { dmgMul: 1, chargeSpeed: 1, parryBonus: 0, tapCostMul: 1, stamAdd: 0, regenMul: 1 }; }
  function xpNeed(lvl) { return D.xp.base + D.xp.perLvl * lvl; }

  function makeHero(lvl, rh) {
    const hd = D.hero;
    const mods = rh ? rh.mods : defaultMods();
    const hpMax = rh ? rh.hpMax : hd.hp + hd.hpPerLvl * (lvl - 1);
    const stamMax = hd.stamina + mods.stamAdd;
    return {
      lvl, hpMax, hp: rh ? rh.hp : hpMax, stamMax, stam: stamMax,
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

  function newFight(id, heroLvl, enemyLvl, opts = {}) {
    const ed = D.enemies[id];
    const st = assets[id].stages;
    const s0 = st[0];
    const maxH = ed.height || 620, maxW = 500;
    const sc = Math.min(maxH / s0.h, maxW / s0.w);
    const dw = s0.w * sc, dh = s0.h * sc;
    const bottom = HUD_BOTTOM + 6;
    const cx = W / 2 + (ed.offsetX || 0) * sc;
    const hero = makeHero(heroLvl, opts.runHero);
    const kind = ed.kind || 'normal';
    const lv = enemyLvl - 1;
    fight = {
      id, ed, t: 0, over: false, outcome: null, resultShown: false, overT: 0, endT: 0,
      inRun: !!opts.runHero, theme: ed.theme || (kind === 'boss' ? 'spirit' : 'dungeon'),
      layout: { cx, bottom, dw, dh, top: bottom - dh, chestY: bottom - dh * (ed.chest || 0.62) },
      hero,
      enemy: {
        lvl: enemyLvl, kind,
        hpMax: Math.round(ed.hp * (1 + 0.22 * lv)), hp: 0,
        stamMax: Math.round(ed.stamina * (1 + 0.32 * lv)), stam: 0,
        dmgScale: 1 + 0.18 * lv,
        atk: { ...ed.attack }, sph: { ...ed.spheres }, vinesCfg: null, phase: 0,
        stage: 0, parts: armorParts(ed, st.length), state: 'idle', st: 0,
        nextAttack: rand(1.4, 2.2), strikesLeft: 0, telDur: 0, lastStamHit: -9,
        nextSpheres: rand(3, 5), nextWeak: rand(3, 5), nextVine: rand(3, 5), capture: 0, lastStand: false,
        burn: 0, burnDps: 0, burnTick: 0,
        anim: { white: 0, lunge: 0, knock: 0, sx: 1, sy: 1 }
      },
      spheres: [], weak: null, vines: [], hazard: HAZARDS[ed.hazard] || HAZARDS.vines, guardT: -9, guardPresses: [],
      fx: { texts: [], parts: [], shards: [], trails: [], links: [], shields: [] },
      shake: 0, hitStop: 0, tip: '', tipT: 0, banner: null,
      stats: { taps: 0, slashes: 0, parries: 0, blocks: 0, links: 0, breaks: 0, taken: 0, vines: 0 }
    };
    const e = fight.enemy;
    e.hp = e.hpMax;
    e.stam = e.stamMax;
    hero.stamPower = levelMod(heroLvl, enemyLvl) * (1 + D.hero.dmgPerLvl * (heroLvl - 1)) * hero.mods.dmgMul;
    if (kind === 'boss' && ed.phases) applyPhase(e, 0, false);
    const kindLabel = kind === 'boss' ? 'Босс' : kind === 'elite' ? 'Элита' : ed.subtitle;
    fight.banner = { title: ed.name, sub: kind === 'boss' ? ed.phases[0].title : kindLabel, t: 0, life: 1.8 };
    resetInput();
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
  // Рядовые без брони не получают бонусного урона; босс сохраняет бонус
  function armorBonus(e) { return e.kind !== 'boss' && isLastStage(e) ? 1 : 1 + 0.25 * e.stage; }
  function fighting() { return fight && !fight.over; }
  function enemyActive(e) { return !['leaving', 'subdued'].includes(e.state); }
  const tired = (e) => e.stam < e.stamMax * 0.3;

  function spendStamina(h, cost) {
    h.lastStamUse = fight.t;
    if (h.exhausted) return;
    h.stam -= cost * h.mods.tapCostMul;
    if (h.stam <= 0) {
      h.stam = 0; h.exhausted = true; h.combo = 0;
      floatText(W / 2, 700, 'Одышка!', '#ff9a7a', 28);
      tip('Не спамь: пауза восстанавливает выносливость и заряжает удар');
    }
  }
  function enemyStamina(e, amount) {
    e.stam = Math.max(0, e.stam - amount);
    e.lastStamHit = fight.t;
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
    if (e.state === 'subdued') { finishOff(); return; }
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
      floatText(x, y - 20, 'Шок! Удар сорвался', D.elements.electric.color, 22);
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
    if (crit) floatText(x, y - 56, 'КРИТ!', '#ffd060', 30);
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

  function heroSlash(path) {
    if (!fighting()) return;
    const h = fight.hero, e = fight.enemy;
    const p0 = path[0], p1 = path[path.length - 1];
    if (e.state === 'subdued') { finishOff(); return; }
    if (!enemyActive(e)) return;
    fight.fx.trails.push({ pts: path.map((p) => ({ x: p.x, y: p.y })), t: 0, life: 0.35, color: '#ffffff', w: 10 });
    if (h.shock > 0) { h.shock--; h.chargeT = 0; floatText(p1.x, p1.y, 'Шок! Росчерк сорвался', D.elements.electric.color, 22); sfx.fail(); return; }
    spendStamina(h, D.hero.slashCost);
    let mult = chargeMult(h);
    h.chargeT = 0;
    let crit = false;
    if (fight.weak && pathHitsCircle(path, fight.weak.x, fight.weak.y, 40)) { crit = true; mult *= hasRelic(h, 'claw') ? 3 : 2; enemyStamina(e, 8 * h.stamPower); fight.weak = null; }
    const ex = (h.exhausted ? 0.2 : 1) * (h.entangled > 0 ? 0.5 : 1);
    const dmg = h.dmg * 1.3 * levelMod(h.lvl, e.lvl) * mult * armorBonus(e) * ex * rand(0.92, 1.08);
    const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
    damageEnemy(dmg, mx, my - 20, crit ? '#ffd060' : '#9fe3ff', true);
    floatText(mx, my - 62, crit ? 'РАССЕЧЕНИЕ! КРИТ!' : 'Рассечение', '#bfefff', 24);
    enemyStamina(e, (6 + 7 * (mult - 1)) * h.stamPower * ex);
    const a = e.anim;
    a.white = 0.9; a.knock = 1; a.sx = 1.05; a.sy = 0.95;
    fight.hitStop = 0.08; fight.shake = Math.max(fight.shake, 9);
    fight.fx.trails.push({ pts: path.map((p) => ({ x: p.x, y: p.y })), t: 0, life: 0.5, color: '#9fe3ff', w: 22 });
    burst(mx, my, 18, ['#bfefff', '#ffffff', '#7fd8ff'], 360, 0.45, 4, 150);
    if (fight.over) return;
    tryBreak(e);
    addCombo(h);
    fight.stats.slashes++;
    sfx.slash();
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
    if (!tired(e) || !enemyActive(e)) return;
    if (!isLastStage(e)) breakArmor(e);
    else subdue(e);
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
    if (isLastStage(e) && e.kind !== 'boss') { subdue(e); return; }
    floatText(L.cx, L.chestY - 40, 'БРОНЯ СЛОМАНА!', '#ffe2a8', 34, 1.4, -30);
    e.state = 'stun'; e.st = 1.5; e.strikesLeft = 0;
    e.stam = e.stamMax * 0.85;
    if (e.kind === 'boss') applyPhase(e, e.stage);
    else if (fight.ed.rage) {
      e.atk.interval = e.atk.interval.map((v) => v * 0.8);
      e.atk.telegraph = Math.max(0.62, e.atk.telegraph * 0.92);
      fight.banner = { title: 'Ярость!', sub: 'Атакует чаще', t: 0, life: 1.6 };
    }
    tip('Броня сломана: противница оглушена на 1,5 с, урон по ней +25%');
  }

  function subdue(e) {
    const L = fight.layout;
    e.state = 'subdued'; e.st = SUBDUE_WINDOW; e.strikesLeft = 0; e.capture = 0;
    floatText(L.cx, L.chestY - 40, 'СЛОМЛЕНА!', '#ffd060', 38, 1.6, -25);
    for (const s of fight.spheres) burst(s.x, s.y, 8, [D.elements[s.el].color], 140, 0.4, 3, 0);
    fight.spheres = []; fight.weak = null; fight.vines = [];
    tip(fight.hero.seals > 0 ? 'Удерживай палец на ней — захват. Тап — добить' : 'Печатей захвата нет. Тап — добить', 3);
  }

  function finishOff() {
    const L = fight.layout;
    fight.fx.trails.push({ pts: [{ x: L.cx - 180, y: L.chestY - 120 }, { x: L.cx + 180, y: L.chestY + 140 }], t: 0, life: 0.6, color: '#ffd060', w: 26 });
    burst(L.cx, L.chestY, 40, ['#ffd060', '#ffffff', '#ff9a50'], 480, 0.8, 5, 200);
    fight.shake = 18;
    sfx.slash(); sfx.win();
    endFight('finished');
  }

  function capture() {
    const h = fight.hero;
    h.seals--;
    sfx.capture();
    const L = fight.layout;
    burst(L.cx, L.chestY, 50, ['#e9c27a', '#fff3d0', '#b48cff'], 300, 1, 4, 0);
    const prev = save.captured[fight.id];
    save.captured[fight.id] = { lvl: Math.max(fight.enemy.lvl, prev ? prev.lvl : 0), at: Date.now(), times: (prev ? prev.times || 1 : 0) + 1 };
    endFight('captured');
  }

  function endByEnemyHp() {
    const e = fight.enemy;
    if (e.state === 'subdued' || isLastStage(e)) { sfx.win(); endFight('defeated'); }
    else endFight('escaped');
  }

  function endFight(outcome) {
    if (fight.over) return;
    fight.over = true;
    fight.outcome = outcome;
    fight.endT = fight.t;
    fight.overT = 0;
    const e = fight.enemy;
    e.state = 'leaving'; e.st = 0;
    fight.spheres = []; fight.weak = null; fight.vines = [];
    if (outcome === 'lose') sfx.lose();
    save.fights.unshift({ id: fight.id, h: fight.hero.lvl, e: e.lvl, t: Math.round(fight.t), o: outcome, run: fight.inRun });
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
    const holding = input.down && input.guardPress && !input.swiping && h.entangled <= 0;
    fight.guardPresses = [];
    const dmg = e.atk.dmg * e.dmgScale * levelMod(e.lvl, h.lvl) * rand(0.9, 1.1);
    const c = guardCenter();
    e.anim.lunge = 1;
    if (since >= pmin && since <= pmax && presses <= 1 && input.lastTapT < fight.guardT - 0.2) {
      fight.guardT = -9;
      fight.fx.shields.push({ x: c.x, y: c.y, r: GUARD_R, t: 0, life: 0.5, color: '#9fffc9' });
      enemyStamina(e, 14 * h.stamPower);
      fight.stats.parries++;
      addCombo(h);
      if (hasRelic(h, 'fang')) h.chargeT = CHARGE_FULL;
      floatText(L.cx, L.chestY - 30, 'ПАРИРОВАНИЕ!', '#bfefff', 34, 1.1, -40);
      burst(L.cx, L.chestY + 60, 30, ['#ffffff', '#bfefff', '#7fd8ff'], 420, 0.5, 4, 100);
      fight.shake = Math.max(fight.shake, 6);
      sfx.parry();
      if (tired(e) && isLastStage(e)) { subdue(e); return; }
      e.state = 'stun'; e.st = 0.7; e.strikesLeft = 0;
      return;
    }
    if (holding) {
      fight.fx.shields.push({ x: c.x, y: c.y, r: GUARD_R, t: 0, life: 0.45, color: '#ffe28a' });
      const taken = dmg * D.hero.blockTaken;
      hurtHero(taken, false);
      enemyStamina(e, 6 * h.stamPower);
      fight.stats.blocks++;
      addCombo(h);
      floatText(W / 2, 640, 'Блок  −' + Math.round(taken), '#ffe28a', 26);
      sfx.block();
      fight.shake = Math.max(fight.shake, 4);
      return;
    }
    hurtHero(dmg, true);
    h.combo = 0;
    floatText(W / 2, 640, '−' + Math.round(dmg), '#ff6b5e', 34);
    sfx.hurt();
    fight.shake = Math.max(fight.shake, 12);
    if (fight.stats.parries + fight.stats.blocks < 2) tip('Нажми в круг удара, когда кольцо зелёное — парирование. Держи палец в круге — блок');
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
    const slow = hasRelic(fight.hero, 'bell') ? 1.3 : 1;
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
    if (s.el === 'fire') { h.burn = 4; h.burnDps = base * 0.25; floatText(s.x, s.y, 'Горение!', c.color, 24); }
    if (s.el === 'electric') { h.shock = 3; hurtHero(base * 0.3, true); floatText(s.x, s.y, 'Шок ×3', c.color, 24); }
    if (s.el === 'ice') { h.chill = 5; hurtHero(base * 0.3, true); floatText(s.x, s.y, 'Холод: заряд медленнее', c.color, 22); }
    if (s.el === 'ghost') { h.burn = 3; h.burnDps = base * 0.25; h.chill = 3; floatText(s.x, s.y, 'Холодное пламя!', c.color, 24); }
    if (s.el === 'nature') {
      const heal = Math.round(e.hpMax * 0.05);
      e.hp = Math.min(e.hpMax, e.hp + heal);
      floatText(fight.layout.cx, fight.layout.chestY, '+' + heal, c.color, 30);
      fight.fx.links.push({ pts: [{ x: s.x, y: s.y }, { x: fight.layout.cx, y: fight.layout.chestY }], t: 0, life: 0.5, color: c.color });
    }
    tip('Соединяй сферы росчерком, пока они не выросли');
  }

  // помехи босса: тянутся от края к центру, срезаются росчерком поперёк
  const HAZARDS = {
    vines: { cut: 'Лиана срезана', status: 'Опутан', hit: 'Опутан!', guardOff: 'Опутан — защита не работает', tip: 'Срезай лианы росчерком поперёк, пока они не дотянулись до центра', short: 'Срезай лианы росчерком поперёк', stat: 'Срезано лиан', color: '#6fdc6a', cutColor: '#9fe89a' },
    wisps: { cut: 'Огонёк развеян', status: 'Одержим', hit: 'Одержим!', guardOff: 'Одержим — защита не работает', tip: 'Развеивай призрачные огоньки росчерком поперёк их следа', short: 'Развеивай огоньки росчерком поперёк следа', stat: 'Развеяно огоньков', color: '#6cc8ff', cutColor: '#bfe6ff' }
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
  function resolveSwipe(path) {
    if (!fighting()) return;
    const e = fight.enemy, L = fight.layout;
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
      addCombo(fight.hero);
      floatText(hit[n - 1].x, hit[n - 1].y - 30, `Связка ×${n}  −${amount} выносл.`, '#ffe9a8', 24);
      sfx.link();
      if (n >= 3 && hasRelic(fight.hero, 'moon')) tryBreak(e);
      return;
    }
    if (e.state === 'telegraph') {
      const c = guardCenter();
      if (pathHitsCircle(path, c.x, c.y, GUARD_R)) { floatText(c.x, c.y - GUARD_R - 14, 'По кругу удара — без урона', '#cfd6e6', 18, 0.7); return; }
    }
    let len = 0;
    for (let i = 1; i < path.length; i++) len += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
    const box = { x0: L.cx - L.dw * 0.32, x1: L.cx + L.dw * 0.32, y0: L.top + L.dh * 0.08, y1: L.bottom - 20 };
    const crosses = path.some((p) => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1);
    if (len >= 90 && crosses) heroSlash(path);
    else if (hit.length === 1) floatText(hit[0].x, hit[0].y - 30, 'Нужно соединить две сферы', '#ffe9a8', 20);
  }

  // ---------------------------------------------------------------- обновление боя
  function updateFight(dt) {
    const f = fight;
    if (!f.over) f.t += dt; else f.overT += dt;
    let dtE = dt;
    if (f.hitStop > 0) { f.hitStop -= dt; dtE = 0; }
    updateHero(dt);
    updateEnemy(dtE, dt);
    updateSpheres(dtE);
    updateVines(dtE);
    updateFx(dt);
    f.shake = Math.max(0, f.shake - dt * 40);
    if (f.tipT > 0) f.tipT -= dt;
    if (f.banner) { f.banner.t += dt; if (f.banner.t > f.banner.life) f.banner = null; }

    const e = f.enemy;
    if (e.state === 'subdued') {
      const holding = input.down && !input.swiping && f.t - input.downT > 0.18;
      if (holding && f.hero.seals > 0) {
        e.capture += dt / CAPTURE_TIME;
        if (e.capture >= 1) capture();
      } else {
        e.capture = Math.max(0, e.capture - dt * 1.5);
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'idle'; e.nextAttack = rand(0.8, 1.2); e.stam = e.stamMax * 0.6;
          if (e.kind !== 'boss' && !e.lastStand) {
            e.lastStand = true;
            e.atk.interval = e.atk.interval.map((v) => v * 2);   // без брони атакует вдвое реже
          }
          floatText(f.layout.cx, f.layout.chestY - 40, 'Пришла в себя!', '#ff9a7a', 28);
          tip('Измотай её снова: удар или росчерк при выносливости ниже 30% — она снова сломлена');
        }
      }
    }
    if (f.over && !f.resultShown && f.overT > 1.4) { f.resultShown = true; showResult(); }
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
    if (e.state !== 'subdued' && e.state !== 'stun' && fight.t - e.lastStamHit > 2) e.stam = Math.min(e.stamMax, e.stam + ed.stamRegen * dt);
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
    drawBackground(f.theme, G.time);
    drawEnemy();
    drawWeak();
    drawTelegraph();
    drawForeground(f.theme);
    drawVines();
    drawSpheres();
    drawFx();
    drawCapture();
    ctx.restore();
    drawHurtOverlay();
    drawTopHud();
    drawBottomHud();
    drawBanner();
    drawSwipe();
  }

  function drawEnemy() {
    const f = fight, e = f.enemy, a = e.anim, L = f.layout;
    const sts = assets[f.id].stages;
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
      const t = e.st;
      if (f.outcome === 'escaped') { x += t * 520; alpha = clamp(1 - t * 0.9, 0, 1); }
      else if (f.outcome === 'captured') { sc *= Math.max(0.05, 1 - t * 0.75); alpha = clamp(1 - t * 0.5, 0, 1); y -= t * 120; }
      else if (f.outcome !== 'lose') { alpha = clamp(1 - t * 0.8, 0, 1); y += t * 60; }
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
    if (e.state === 'subdued') {
      ctx.globalAlpha = alpha * (0.18 + 0.08 * Math.sin(G.time * 4));
      ctx.drawImage(st.dark, dx, dy, L.dw, L.dh);
    }
    if (a.white > 0) {
      ctx.globalAlpha = alpha * a.white;
      ctx.drawImage(st.white, dx, dy, L.dw, L.dh);
    }
    ctx.restore();
    if (e.state === 'stun') drawStars(L.cx, L.top + 30);
    if (e.state === 'subdued') drawChains(L);
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

  function drawChains(L) {
    const e = fight.enemy;
    ctx.save();
    const y = L.chestY + 30;
    const glow = 0.5 + 0.5 * Math.sin(G.time * 5);
    ctx.strokeStyle = `rgba(233,194,122,${0.45 + 0.35 * glow})`;
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const px = L.cx + i * (240 - t * 160), py = y - 120 + t * 160 + Math.sin(t * 6 + G.time * 3) * 6;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(16,12,20,.75)';
    roundRect(L.cx - 120, L.top + 6, 240, 30, 15); ctx.fill();
    ctx.fillStyle = '#e9c27a';
    roundRect(L.cx - 116, L.top + 10, 232 * clamp(e.st / SUBDUE_WINDOW, 0, 1), 22, 11); ctx.fill();
    ctx.fillStyle = '#1a1208'; ctx.font = '600 14px ' + bodyFont; ctx.textAlign = 'center';
    ctx.fillText('СЛОМЛЕНА', L.cx, L.top + 26);
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
    const holding = input.down && input.guardPress && !input.swiping;
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
    const label = holding ? 'БЛОК' : inParry ? 'ЖМИ!' : 'ЖМИ В КРУГ';
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

  function drawCapture() {
    const e = fight.enemy;
    if (e.state !== 'subdued' || e.capture <= 0) return;
    const L = fight.layout;
    const x = input.down ? input.x : L.cx, y = input.down ? input.y : L.chestY;
    ctx.save();
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(16,12,20,.7)';
    ctx.beginPath(); ctx.arc(x, y, 56, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#e9c27a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, 56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.capture); ctx.stroke();
    ctx.fillStyle = '#e9c27a'; ctx.font = `700 18px ${displayFont}`; ctx.textAlign = 'center';
    ctx.fillText('Захват', x, y - 70);
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
    ctx.fillText(`ур. ${e.lvl}`, nx, 38);
    nx += ctx.measureText(`ур. ${e.lvl}`).width + 10;
    if (e.kind === 'elite') tag('ЭЛИТА', nx, 36, '#c8622a');
    if (e.kind === 'boss') tag(`БОСС · ФАЗА ${e.phase + 1}/${e.parts + 1}`, nx, 36, '#8a3cc0');

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
    ctx.fillText(tir ? 'ИЗМОТАНА' : 'выносливость', 20, 102);
    if (e.lastStand) { ctx.fillStyle = '#9fd98a'; ctx.fillText('· без брони: атакует вдвое реже', 96, 102); }

    const parts = e.parts;
    ctx.textAlign = 'right'; ctx.fillStyle = '#b9ae9c';
    ctx.fillText('броня', W - 20, 102);
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
      ctx.fillText('комбо', W - 24, 218);
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
    ctx.fillText('Герой', 20, y0 + 48);
    ctx.fillStyle = '#b9ae9c'; ctx.font = `500 13px ${bodyFont}`;
    ctx.fillText(`ур. ${h.lvl}`, 76, y0 + 48);
    if (h.relics.length) { ctx.fillStyle = '#c9b6f0'; ctx.fillText(`реликвий: ${h.relics.length}`, 124, y0 + 48); }

    bar(20, y0 + 56, 300, 16, h.hp / h.hpMax, h.hp / h.hpMax < 0.3 ? '#d9473f' : '#5fbf6a');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `600 11px ${bodyFont}`;
    ctx.fillText(`${Math.ceil(h.hp)} / ${h.hpMax}`, 170, y0 + 68);
    const exh = h.exhausted;
    bar(20, y0 + 77, 300, 10, h.stam / h.stamMax, exh ? `rgba(255,${90 + 60 * Math.sin(G.time * 12)},70,1)` : '#4fa6e0');
    ctx.textAlign = 'left'; ctx.font = `600 12px ${bodyFont}`;
    ctx.fillStyle = exh ? '#ff9a7a' : '#b9ae9c';
    ctx.fillText(exh ? 'ОДЫШКА — удары слабые' : 'выносливость', 20, y0 + 102);

    let sx = 20;
    const pill = (text, color) => {
      ctx.font = `600 12px ${bodyFont}`;
      const w = ctx.measureText(text).width + 18;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(sx, y0 + 110, w, 20, 10); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; roundRect(sx, y0 + 110, w, 20, 10); ctx.stroke();
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, sx + 9, y0 + 124);
      sx += w + 8;
    };
    if (h.burn > 0) pill(`Горение ${h.burn.toFixed(1)} с`, D.elements.fire.color);
    if (h.shock > 0) pill(`Шок ×${h.shock}`, D.elements.electric.color);
    if (h.chill > 0) pill(`Холод ${h.chill.toFixed(1)} с`, D.elements.ice.color);
    if (h.entangled > 0) pill(`${fight.hazard.status} ${h.entangled.toFixed(1)} с`, fight.hazard.color);

    const labels = ['Авангард', 'Клинок', 'Тыл'];
    for (let i = 0; i < 3; i++) {
      const x = 20 + i * 54, y = y0 + 138;
      ctx.fillStyle = 'rgba(255,255,255,.04)'; roundRect(x, y, 44, 40, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(233,194,122,.25)'; ctx.setLineDash([4, 4]); roundRect(x, y, 44, 40, 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#6f6578'; ctx.font = `500 10px ${bodyFont}`; ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + 22, y + 52);
      ctx.font = `600 16px ${displayFont}`; ctx.fillText('?', x + 22, y + 26);
    }
    drawSeals(196, y0 + 152, h.seals, h.sealsMax);

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
    ctx.fillText(m >= CHARGED ? 'ломает броню' : 'заряд', cx, cy + r + 22);

    const text = f.tipT > 0 ? f.tip : contextTip();
    ctx.fillStyle = '#d8ccb6'; ctx.font = `500 13px ${bodyFont}`; ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, H - 9);
  }

  function drawSeals(x0, y, n, max) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9ae9c'; ctx.font = `500 12px ${bodyFont}`;
    ctx.fillText('Печати захвата', x0, y);
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
    if (e.state === 'subdued') return f.hero.seals > 0 ? 'Удерживай палец на ней — захват · Тап — добить' : 'Тап — добить';
    if (e.state === 'telegraph') return 'Нажми в круг, когда кольцо зелёное — парирование. Держи в круге — блок';
    if (f.vines.length) return f.hazard.short;
    if (tired(e)) return 'Измотана! Заряженный удар (×1.8+) или росчерк ломает броню';
    if (f.spheres.length >= 2) return 'Проведи росчерк через две сферы — она потеряет выносливость';
    return 'Тап — удар · Пауза — заряд · Круг удара — защита · Росчерк — рассечение';
  }

  function drawSwipe() {
    if (!input.down || !input.swiping || input.path.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pts = input.path.slice(-36);
    const col = '200,240,255';
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
    start:    { name: 'Темница',   color: '#8c7d9a' },
    fight:    { name: 'Бой',       color: '#e2554b' },
    elite:    { name: 'Элита',     color: '#ff8c3a' },
    rest:     { name: 'Привал',    color: '#ffb347' },
    event:    { name: 'Событие',   color: '#8fb8ff' },
    treasure: { name: 'Сокровище', color: '#e9c27a' },
    boss:     { name: 'Босс',      color: '#c84cff' }
  };

  const pickOne = (v) => (Array.isArray(v) ? pick(v) : v);
  function genFloor() {
    const F = D.floor;
    const layers = F.layers.map((L, li) => shuffle(L.rooms).map((type, i) => {
      const node = { type, li, i, next: [], visited: false, done: false };
      if (type === 'fight') { node.enemy = pick(L.pool); node.lvl = L.lvl; }
      if (type === 'elite') { node.enemy = pickOne(F.elite); node.lvl = L.eliteLvl || L.lvl + 1; }
      if (type === 'boss') { node.enemy = pickOne(L.boss); node.lvl = L.lvl; }
      return node;
    }));
    // соседние бои одного слоя — разные противницы, если можно
    for (const L of layers) {
      const fights = L.filter((n) => n.type === 'fight');
      if (fights.length > 1 && fights[0].enemy === fights[1].enemy) {
        const pool = F.layers[fights[0].li].pool.filter((p) => p !== fights[0].enemy);
        if (pool.length) fights[1].enemy = pick(pool);
      }
    }
    for (let li = 0; li < layers.length - 1; li++) {
      const A = layers[li], B = layers[li + 1];
      A.forEach((a, i) => {
        const j = B.length === 1 ? 0 : Math.round(i * (B.length - 1) / Math.max(1, A.length - 1));
        a.next.push(B[j]);
        const k = j + (Math.random() < 0.5 ? -1 : 1);
        if (B[k] && !a.next.includes(B[k])) a.next.push(B[k]);
        else if (B[j - (k - j)] && !a.next.includes(B[j - (k - j)])) a.next.push(B[j - (k - j)]);
      });
      B.forEach((b) => {
        if (!A.some((a) => a.next.includes(b))) {
          let best = A[0], bd = 99;
          A.forEach((a) => { const d = Math.abs(a.i / Math.max(1, A.length - 1) - b.i / Math.max(1, B.length - 1)); if (d < bd) { bd = d; best = a; } });
          best.next.push(b);
        }
      });
      A.forEach((a) => a.next.sort((x, y) => x.i - y.i));
    }
    const start = { type: 'start', li: -1, i: 0, next: layers[0].slice(), visited: true, done: false };
    return { name: F.name, layers, start };
  }

  function startRun() {
    run = {
      floor: genFloor(),
      cur: null,
      hero: { lvl: 1, xp: 0, hpMax: D.hero.hp, hp: D.hero.hp, seals: D.hero.seals, sealsMax: D.hero.seals, mods: defaultMods(), relics: [], upgrades: [] },
      captured: [], fights: 0, time: 0, events: shuffle(EVENTS.map((e) => e.id)), trans: null, doors: []
    };
    run.cur = run.floor.start;
    fight = null;
    G.mode = 'map';
    hideAllOverlays();
    show(ui.pauseBtn);
    showPanel({
      kicker: 'Пролог', title: 'Темница',
      text: 'Ты снова открываешь глаза на холодном полу темницы. Метка проклятия жжёт запястье — владелица подземелья не отпустит так просто.\n\nГде-то наверху — выход. Нужно подниматься.',
      choices: [{ title: 'Встать', desc: 'Перед тобой несколько проходов. Значки над ними подскажут, что ждёт впереди.', on: () => { run.cur.done = true; hidePanel(); } }]
    });
  }

  function roomCount() { return run.floor.layers.length; }
  function curLayerIdx() { return run.cur.li + 1; }

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
    drawMiniMap();
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
      ? `${R.name} · ур. ${node.lvl}` : R.name;
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
    ctx.fillText(`комната ${Math.max(0, curLayerIdx())}/${roomCount()}`, W - 20, 36);

    bar(20, 48, W - 40, 15, rh.hp / rh.hpMax, rh.hp / rh.hpMax < 0.3 ? '#d9473f' : '#5fbf6a');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `600 11px ${bodyFont}`;
    ctx.fillText(`Герой ур. ${rh.lvl} · ${Math.ceil(rh.hp)} / ${rh.hpMax}`, W / 2, 60);
    const need = xpNeed(rh.lvl);
    bar(20, 69, W - 40, 7, rh.xp / need, '#9a7be0');
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9ae9c'; ctx.font = `500 11.5px ${bodyFont}`;
    ctx.fillText(`опыт ${rh.xp}/${need}`, 20, 92);
    drawSeals(150, 92, rh.seals, rh.sealsMax);
    ctx.textAlign = 'right'; ctx.fillStyle = '#c9b6f0';
    const names = rh.relics.map((id) => D.relics.find((r) => r.id === id).name);
    ctx.fillText(names.length ? names.slice(-2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') : 'реликвий нет', W - 20, 92);
  }

  function drawMiniMap() {
    const y0 = 800;
    bottomPanel(y0 - 30);
    const cols = [run.floor.start, ...run.floor.layers];
    const colX = (i) => 46 + i * ((W - 92) / (cols.length - 1));
    const pos = new Map();
    pos.set(run.floor.start, { x: colX(0), y: y0 + 72 });
    run.floor.layers.forEach((L, li) => L.forEach((n, j) => pos.set(n, { x: colX(li + 1), y: y0 + 72 + (j - (L.length - 1) / 2) * 46 })));
    const all = [run.floor.start, ...run.floor.layers.flat()];
    ctx.save();
    for (const n of all) {
      const p = pos.get(n);
      for (const m of n.next) {
        const q = pos.get(m);
        const walked = n.visited && m.visited;
        ctx.strokeStyle = walked ? 'rgba(233,194,122,.85)' : 'rgba(185,174,156,.22)';
        ctx.lineWidth = walked ? 3 : 1.5;
        line(ctx, p.x, p.y, q.x, q.y);
      }
    }
    for (const n of all) {
      const p = pos.get(n);
      const reachable = run.cur.done && run.cur.next.includes(n);
      drawRoomIcon(n.type, p.x, p.y, 14, !(n.visited || reachable));
      if (n === run.cur) {
        ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 19 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
      } else if (reachable) {
        ctx.strokeStyle = `rgba(233,194,122,${0.4 + 0.4 * Math.sin(G.time * 5)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#d8ccb6'; ctx.font = `500 13px ${bodyFont}`; ctx.textAlign = 'center';
    ctx.fillText(run.cur.done ? 'Выбери дверь — значок над ней показывает, что впереди' : '', W / 2, H - 9);
  }

  function chooseDoor(i) {
    if (!run || run.trans || G.panelOpen || !run.cur.done) return;
    const d = run.doors[i];
    if (!d) return;
    run.trans = { t: 0, dur: 0.7, x: d.cx, y: d.cy, node: d.node };
    sfx.door();
  }

  function mapPointer(p) {
    if (!run || run.trans || G.panelOpen || !run.cur.done) return;
    const i = run.doors.findIndex((d) => p.x >= d.box.x0 && p.x <= d.box.x1 && p.y >= d.box.y0 && p.y <= d.box.y1);
    if (i >= 0) chooseDoor(i);
  }

  function enterNode(node) {
    node.visited = true;
    run.cur = node;
    const rh = run.hero;
    switch (node.type) {
      case 'fight':
      case 'elite':
        startRunFight(node);
        break;
      case 'boss': {
        const ed = D.enemies[node.enemy];
        showPanel({
          kicker: 'Босс этажа', title: ed.name, img: ed.sprites[0], text: ed.intro,
          choices: [{ title: 'Сразиться', desc: ed.about, on: () => { hidePanel(); startRunFight(node); } }]
        });
        break;
      }
      case 'rest':
        showRest();
        break;
      case 'treasure': {
        const opts = relicChoices(3);
        if (!opts.length) { grantXp(40); showPanel({ kicker: 'Сокровище', title: 'Пустой сундук', text: 'Кто-то побывал здесь раньше. На дне — только старые монеты. Опыт +40.', choices: [{ title: 'Дальше', on: roomDone }] }); break; }
        showPanel({
          kicker: 'Сокровище', title: 'Сундук', text: 'Под слоем пыли — три вещицы, пропитанные силой подземелья. Унести можно только одну.',
          choices: opts.map((r) => ({ title: r.name, desc: r.text, cls: 'relic', ck: 'реликвия', on: () => { addRelic(r.id); roomDone(); } }))
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
    G.mode = 'map';
    fight = null;
    show(ui.pauseBtn);
  }

  function startRunFight(node) {
    newFight(node.enemy, run.hero.lvl, node.lvl, { runHero: run.hero });
    G.mode = 'fight'; G.paused = false;
    hideAllOverlays(); show(ui.pauseBtn);
  }

  function afterRunFight() {
    const f = fight, rh = run.hero, node = run.cur;
    rh.hp = Math.max(0, Math.round(f.hero.hp));
    rh.seals = f.hero.seals;
    run.fights++;
    run.time += f.endT;
    if (f.outcome === 'lose') { runOver(); return; }
    if (f.outcome === 'captured') run.captured.push(f.id);
    if (node.type === 'boss') { runComplete(); return; }
    const base = f.ed.xp;
    const xp = Math.round(base * (f.outcome === 'captured' ? 0.8 : f.outcome === 'escaped' ? 0.5 : 1));
    const lv = grantXp(xp);
    const lines = [`Опыт +${xp}.`];
    if (f.outcome === 'captured') lines.push(`${f.ed.name} поймана и навсегда остаётся в коллекции.`);
    if (lv) lines.push(`Новый уровень: ${rh.lvl}! Здоровье и урон выросли.`);
    lines.push('', 'Выбери награду:');
    const choices = [];
    const rel = relicChoices(1)[0];
    if (rel) choices.push({ title: rel.name, desc: rel.text, cls: 'relic', ck: 'реликвия', on: () => { addRelic(rel.id); roomDone(); } });
    const up = pick(D.upgrades);
    choices.push({ title: up.name, desc: up.text, ck: 'улучшение', on: () => { applyUpgrade(up.id); roomDone(); } });
    if (rh.seals < 4) choices.push({ title: 'Печать захвата', desc: `+1 печать (сейчас ${rh.seals}).`, ck: 'печать', on: () => { rh.seals++; rh.sealsMax = Math.max(rh.sealsMax, rh.seals); roomDone(); } });
    else choices.push({ title: 'Перевязка', desc: 'Восстановить 30% здоровья.', ck: 'лечение', on: () => { heal(0.3); roomDone(); } });
    G.mode = 'map';
    hide(ui.result);
    if (lv) sfx.level();
    showPanel({ kicker: node.type === 'elite' ? 'Элита повержена' : 'Победа', title: resultTitle(f.outcome), img: spriteFor(f.ed, f.enemy.stage), text: lines.join('\n'), choices });
  }

  function resultTitle(o) { return { captured: 'Захвачена!', finished: 'Добита', defeated: 'Повержена', escaped: 'Сбежала' }[o] || ''; }

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
      kicker: 'Привал', title: 'Костёр',
      text: `Сухие ветки трещат в огне. Здесь можно перевести дух.\nЗдоровье: ${Math.ceil(rh.hp)} / ${rh.hpMax}.`,
      choices: [
        { title: 'Отдохнуть', desc: 'Восстановить 35% здоровья.', on: () => { heal(0.35); roomDone(); } },
        { title: 'Тренироваться', desc: 'Выбрать одно улучшение из трёх.', on: () => showUpgradePick('Тренировка', 'Удары по манекену из старых доспехов. Что отработать?') },
        { title: 'Поговорить со спутницей', desc: caught ? 'Появится вместе с отрядом в следующих прототипах.' : 'Пока никого нет рядом.', disabled: true }
      ]
    });
  }

  function showUpgradePick(title, text) {
    const ups = shuffle(D.upgrades).slice(0, 3);
    showPanel({ kicker: 'Улучшение', title, text, choices: ups.map((u) => ({ title: u.name, desc: u.text, ck: 'улучшение', on: () => { applyUpgrade(u.id); roomDone(); } })) });
  }

  const EVENTS = [
    {
      id: 'camp', title: 'Брошенный лагерь',
      text: 'Среди разбитых ящиков тлеет костёр. Рядом — чья-то походная сумка, ремни ещё тёплые.',
      choices: [
        { title: 'Обыскать сумку', desc: 'Может, там что-то полезное…', act: () => {
          if (Math.random() < 0.65) { run.hero.seals++; run.hero.sealsMax = Math.max(run.hero.sealsMax, run.hero.seals); return 'Внутри, завёрнутая в тряпицу, лежит печать захвата.'; }
          run.hero.hp = Math.max(1, run.hero.hp - 12); return 'Из сумки выскальзывает змея! Укус жжёт руку. Здоровье −12.';
        } },
        { title: 'Посидеть у огня', desc: 'Восстановить 20% здоровья.', act: () => { heal(0.2); return 'Тепло возвращает силы.'; } }
      ]
    },
    {
      id: 'cage', title: 'Пленница', img: 'bunny',
      text: 'За ржавой решёткой сжалась девушка-крольчиха. «Выпусти меня! Я знаю, где здесь спрятано кое-что ценное…»',
      choices: [
        { title: 'Открыть клетку', desc: 'Поверить ей.', act: () => {
          const r = relicChoices(1)[0];
          if (!r) { grantXp(40); return 'Она ускакала, крикнув «спасибо!». Опыт +40.'; }
          addRelic(r.id); return `Она шепчет о тайнике за шатающимся камнем. Ты находишь реликвию: ${r.name}.\n${r.text}`;
        } },
        { title: 'Пройти мимо', desc: 'В подземелье никому нельзя верить.', act: () => 'Её всхлипы ещё долго звучат за спиной.' }
      ]
    },
    {
      id: 'altar', title: 'Алтарь метки',
      text: 'У древнего алтаря метка проклятия на запястье вспыхивает багровым. Камень жаждет крови.',
      choices: [
        { title: 'Коснуться алтаря', desc: '−20% максимального здоровья, но много опыта.', act: () => {
          run.hero.hp = Math.max(1, Math.round(run.hero.hp - run.hero.hpMax * 0.2));
          const lv = grantXp(100);
          if (lv) sfx.level();
          return 'Боль сменяется силой: ты помнишь сотню битв, которых не было. Опыт +100.' + (lv ? `\nНовый уровень: ${run.hero.lvl}!` : '');
        } },
        { title: 'Уйти', desc: 'Не стоит кормить проклятие.', act: () => 'Метка гаснет. Камень остаётся голодным.' }
      ]
    },
    {
      id: 'whisper', title: 'Шёпот из темноты',
      text: '«Ты снова здесь, мой маленький пленник…» — голос владелицы подземелья звучит отовсюду. «Поднимайся. Посмотрим, как далеко ты зайдёшь в этот раз.»',
      choices: [
        { title: 'Ответить дерзко', desc: 'Пусть знает, что ты не сдашься.', act: () => {
          const u = pick(D.upgrades); applyUpgrade(u.id);
          return `Смех эхом катится по коридорам. Метка теплеет — проклятию нравится твоё упрямство.\nУлучшение: ${u.name}. ${u.text}`;
        } },
        { title: 'Промолчать', desc: 'Восстановить 10% здоровья.', act: () => { heal(0.1); return 'Тишина. Только где-то капает вода.'; } }
      ]
    }
  ];

  function showEvent() {
    const id = run.events.shift() || pick(EVENTS).id;
    const ev = EVENTS.find((e) => e.id === id);
    showPanel({
      kicker: 'Событие', title: ev.title, text: ev.text, img: ev.img ? D.enemies[ev.img].sprites[0] : null,
      choices: ev.choices.map((c) => ({ title: c.title, desc: c.desc, on: () => {
        const out = c.act();
        showPanel({ kicker: 'Событие', title: ev.title, text: out, img: ev.img ? D.enemies[ev.img].sprites[0] : null, choices: [{ title: 'Дальше', on: roomDone }] });
      } }))
    });
  }

  function runSummaryText() {
    const rh = run.hero;
    const names = run.captured.map((id) => D.enemies[id].name);
    return [
      `Время в боях: ${fmtTime(run.time)} · боёв: ${run.fights}`,
      `Уровень героя: ${rh.lvl}`,
      `Пойманы: ${names.length ? names.join(', ') : 'никто'}`,
      `Реликвии: ${rh.relics.length ? rh.relics.map((id) => D.relics.find((r) => r.id === id).name).join(', ') : 'нет'}`
    ].join('\n');
  }

  function finishRun(won) {
    save.runs.unshift({ won, lvl: run.hero.lvl, t: Math.round(run.time), caught: run.captured.length, at: Date.now() });
    save.runs = save.runs.slice(0, 5);
    writeSave();
  }

  function runComplete() {
    finishRun(true);
    G.mode = 'map';
    hide(ui.result); hide(ui.pauseBtn);
    sfx.level();
    showPanel({
      kicker: 'Этаж пройден', title: `${fight.ed.name} ` + (fight.outcome === 'captured' ? 'поймана!' : fight.outcome === 'escaped' ? 'отступила!' : 'повержена!'), img: spriteFor(fight.ed, fight.enemy.stage),
      text: 'Лестница наверх свободна. Где-то выше ждут новые ярусы подземелья — и его владелица.\n\n' + runSummaryText() + '\n\nКонец прототипа уровня.',
      choices: [{ title: 'В меню', on: () => { run = null; toMenu(); } }]
    });
  }

  function runOver() {
    finishRun(false);
    G.mode = 'map';
    hide(ui.result); hide(ui.pauseBtn);
    showPanel({
      kicker: 'Поражение', title: 'Проклятие',
      text: 'Тьма смыкается. Метка вспыхивает — и ты снова очнёшься на холодном полу темницы, на самом дне.\nПойманные спутницы остаются с тобой.\n\n' + runSummaryText(),
      choices: [{ title: 'В меню', on: () => { run = null; toMenu(); } }]
    });
  }

  // ---------------------------------------------------------------- ввод
  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }
  function onPress(p, id) {
    if (G.paused) return false;
    if (G.mode === 'map') { mapPointer(p); return false; }
    if (G.mode !== 'fight' || !fight || input.down) return false;
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
    loading: $('#loading'), menu: $('#menu'), result: $('#result'), pause: $('#pause'), pauseBtn: $('#pauseBtn'), panel: $('#panel')
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
      const kind = e.kind === 'boss' ? 'Босс' : e.kind === 'elite' ? 'Элита' : '';
      b.innerHTML = `
        <div class="portrait"><img src="${e.sprites[0]}" alt=""></div>
        ${kind ? `<div class="badge kind">${kind}</div>` : ''}
        ${save.captured[id] ? '<div class="badge">Поймана</div>' : ''}
        <div class="info"><div class="name">${e.name}</div><div class="tag">${e.subtitle}${e.custom ? ' · своя' : ''}</div><div class="about">${e.about}</div></div>`;
      b.addEventListener('click', () => { G.selected = id; buildMenu(); });
      cards.appendChild(b);
    }
    $('#lvHero').textContent = G.heroLvl;
    $('#lvEnemy').textContent = G.enemyLvl;
    const d = G.heroLvl - G.enemyLvl;
    const boss = D.enemies[G.selected].kind === 'boss';
    $('#lvHint').textContent = boss ? 'Босс: цель — бой 3–5 мин'
      : d === 0 ? 'Равный уровень: цель — бой 25–60 с'
      : d > 0 ? `Герой сильнее на ${d}: цель — бой 10–25 с`
      : `Противница сильнее на ${-d}: цель — бой 1–2 мин, можно проиграть`;
    const names = { captured: 'захвачена', finished: 'добита', defeated: 'повержена', escaped: 'сбежала', lose: 'поражение' };
    const log = $('#log');
    log.innerHTML = save.fights.length ? '' : '<div><span>Пока пусто</span></div>';
    for (const r of save.fights) {
      const row = document.createElement('div');
      row.innerHTML = `<span>${D.enemies[r.id] ? D.enemies[r.id].name : r.id} · ${r.h} / ${r.e}${r.run ? ' · забег' : ''}</span><span>${fmtTime(r.t)} · ${names[r.o] || r.o}</span>`;
      log.appendChild(row);
    }
    const col = $('#collection');
    const caught = Object.entries(save.captured);
    col.innerHTML = caught.length ? '' : '<div><span>Пока никого. Сломи противницу и удерживай палец на ней.</span></div>';
    for (const [id, c] of caught) {
      if (!D.enemies[id]) continue;
      const row = document.createElement('div');
      row.innerHTML = `<span>${D.enemies[id].name}</span><span>ур. ${c.lvl}${c.times > 1 ? ` · поймана ${c.times} раз` : ''}</span>`;
      col.appendChild(row);
    }
    $('#soundBtn').textContent = 'Звук: ' + (sfx.muted ? 'выкл' : 'вкл');
    $('#pauseSoundBtn').textContent = 'Звук: ' + (sfx.muted ? 'выкл' : 'вкл');
  }

  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const [who, d] = b.dataset.step.split(':');
    const key = who === 'hero' ? 'heroLvl' : 'enemyLvl';
    G[key] = clamp(G[key] + Number(d), 1, 10);
    buildMenu();
  }));
  $('#runBtn').addEventListener('click', () => { sfx.ensure(); startRun(); });
  $('#startBtn').addEventListener('click', () => { sfx.ensure(); startTraining(); });
  $('#againBtn').addEventListener('click', () => { sfx.ensure(); startTraining(); });
  $('#nextBtn').addEventListener('click', () => { sfx.ensure(); afterRunFight(); });
  $('#menuBtn').addEventListener('click', () => {
    if (G.returnTo === 'editor' && window.CDEditor) { G.returnTo = null; toMenu(); window.CDEditor.open(); }
    else toMenu();
  });
  $('#quitBtn').addEventListener('click', () => {
    if (run && !confirm('Покинуть забег? Прогресс забега пропадёт, пойманные спутницы останутся.')) return;
    G.paused = false; hide(ui.pause); run = null; toMenu();
    if (G.returnTo === 'editor' && window.CDEditor) { G.returnTo = null; window.CDEditor.open(); }
  });
  $('#resumeBtn').addEventListener('click', () => { G.paused = false; hide(ui.pause); });
  ui.pauseBtn.addEventListener('click', () => { if ((G.mode === 'fight' && !fight.over) || G.mode === 'map') { G.paused = true; resetInput(); buildMenu(); show(ui.pause); } });
  $('#soundBtn').addEventListener('click', () => { sfx.toggle(); buildMenu(); });
  $('#pauseSoundBtn').addEventListener('click', () => { sfx.toggle(); buildMenu(); });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Сбросить пойманных и историю боёв?')) return;
    save = { captured: {}, fights: [], runs: [], muted: sfx.muted }; writeSave(); buildMenu();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'fight' && fight && !fight.over) { G.paused = true; resetInput(); buildMenu(); show(ui.pause); }
  });

  function startTraining() {
    run = null;
    newFight(G.selected, G.heroLvl, G.enemyLvl);
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
    const gold = Math.round((40 + 12 * e.lvl) * (f.outcome === 'escaped' ? 0.5 : 1));
    const T = {
      captured: ['Захвачена!', `${ed.name} связана печатью и навсегда остаётся в коллекции.`],
      finished: ['Добита', `Ты отказался от захвата. Добыча: ${gold} золота.`],
      defeated: ['Повержена', `Здоровье кончилось после того, как броня была разбита. Добыча: ${gold} золота.`],
      escaped: ['Сбежала', `Здоровье кончилось раньше, чем броня, — захват невозможен. Она убежала, бросив ${gold} золота.`],
      lose: ['Поражение', 'Герой пал. Проклятие вернёт его в темницу на самом дне…']
    }[f.outcome];
    $('#resTitle').textContent = T[0];
    $('#resTitle').className = f.outcome === 'lose' ? 'bad' : '';
    $('#resSub').textContent = T[1];
    const t = f.endT;
    const d = h.lvl - e.lvl;
    const [lo, hi] = e.kind === 'boss' ? [180, 300] : d === 0 ? [25, 60] : d > 0 ? [10, 25] : [60, 120];
    const cls = t < lo ? 'warn' : t > hi ? 'bad' : 'ok';
    const verdict = t < lo ? 'быстрее цели' : t > hi ? 'дольше цели' : 'в цели';
    const items = [
      ['Время боя', `<span class="${cls}">${fmtTime(t)}</span>`, `цель ${fmtTime(lo)}–${fmtTime(hi)} · ${verdict}`, true],
      ['Удары', s.taps], ['Росчерки', s.slashes],
      ['Парирования', s.parries], ['Блоки', s.blocks],
      ['Связки сфер', s.links], ['Сломано брони', `${s.breaks} / ${e.parts}`],
      ['Макс. комбо', h.maxCombo], ['Получено урона', Math.round(s.taken)]
    ];
    if (s.vines) items.push([f.hazard.stat, s.vines]);
    $('#resStats').innerHTML = items.map(([k, v, note, wide]) =>
      `<div class="stat${wide ? ' wide' : ''}"><div class="k">${k}</div><div class="v">${v}${note ? ` <span style="font-size:.6em;color:var(--ink-dim)">${note}</span>` : ''}</div></div>`).join('');
    const inRun = f.inRun && run;
    $('#nextBtn').classList.toggle('hidden', !inRun);
    $('#nextBtn').textContent = f.outcome === 'lose' ? 'Итоги забега' : 'Дальше';
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
  }
  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!BG.themes.dungeon) return;
    if ((G.mode === 'fight' || G.mode === 'result') && fight) renderFight();
    else if (G.mode === 'map' && run) renderMap();
    else { drawBackground('dungeon', G.time); drawForeground('dungeon'); }
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!G.paused) update(dt);
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
    if (window.CDEditor) { try { await window.CDEditor.loadCustom(); } catch (e) { console.warn('Свои противницы не загрузились', e); } }
    try {
      await loadAssets();
    } catch (err) {
      ui.loading.innerHTML = `Не удалось загрузить спрайты<div class="err">${err.message}.<br>Откройте index.html из папки игры целиком (вместе с папками assets и js).</div>`;
      return;
    }
    hide(ui.loading);
    G.mode = 'menu';
    buildMenu();
    show(ui.menu);
  }

  // ---------------------------------------------------------------- API для редактора противниц
  D.floor.elite = [].concat(D.floor.elite);
  D.floor.layers.forEach((L) => { if (L.boss) L.boss = [].concat(L.boss); });
  const BUILTIN = new Set(Object.keys(D.enemies));
  function removeFromFloor(id) {
    D.floor.layers.forEach((L) => {
      if (L.pool) L.pool = L.pool.filter((x) => x !== id);
      if (L.boss) L.boss = L.boss.filter((x) => x !== id);
    });
    D.floor.elite = D.floor.elite.filter((x) => x !== id);
  }
  function applyFloor(id, fl = {}) {
    removeFromFloor(id);
    (fl.layers || []).forEach((i) => { const L = D.floor.layers[i]; if (L && L.pool) L.pool.push(id); });
    if (fl.elite) D.floor.elite.push(id);
    if (fl.boss) { const L = D.floor.layers.find((x) => x.boss); if (L) L.boss.push(id); }
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
    registerEnemy, unregisterEnemy, applyFloor,
    hideAll: hideAllOverlays, toMenu, buildMenu,
    startTraining: (id, h, e) => { G.selected = id; G.heroLvl = h; G.enemyLvl = e; startTraining(); }
  };

  // хук для автотестов и отладки
  window.__proto = {
    G, input, ui,
    get fight() { return fight; }, get run() { return run; },
    startFight: startTraining, startRun, chooseDoor, heroTap, resolveSwipe,
    press: (x, y) => onPress({ x, y }, 99), move: (x, y) => onMove({ x, y }, 99), release: () => onRelease(99),
    guardCenter: () => guardCenter(),
    next: afterRunFight
  };
  boot();
})();
