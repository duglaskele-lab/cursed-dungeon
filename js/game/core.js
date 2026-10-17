// Проклятое подземелье — прототип v0.2. Чистый JavaScript + Canvas 2D, без фреймворков.
// Логическое разрешение 540×960 (вертикальный экран), масштабируется под окно.
// Код игры разбит на файлы js/game/*.js — обычные <script> без модулей (так игра открывается с file://).
// Объявления верхнего уровня (const/let/function) общие для всех файлов; порядок подключения — в index.html.
// Ядро: константы, общие помощники, локальный пакет, экран, сохранение, звук, загрузка спрайтов.
'use strict';

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
function tryImage(src) { return loadImage(src).then(() => true, () => false); }
// Локальные стадии без настроек: packs/<id>/stage1.png, stage2.png… (папка вне git).
// Найденная картинка заменяет стадию из data.js, недостающие стадии берутся оттуда же.
// Если спрайты героини заданы в packs/pack.js, папку не ищем — pack.js главнее.
async function findPackStages(id, e) {
  const packed = window.GAME_PACK && window.GAME_PACK.enemies && window.GAME_PACK.enemies[id];
  if ((packed && packed.sprites) || !/^[\w-]+$/.test(id)) return;
  const n = Math.max(e.sprites.length, (e.armor || 0) + 1);
  const found = await Promise.all(Array.from({ length: n }, (_, k) => tryImage(`packs/${id}/stage${k + 1}.png`)));
  if (!found.some(Boolean)) return;
  const sprites = [];
  for (let k = 0; k < n; k++) {
    const src = found[k] ? `packs/${id}/stage${k + 1}.png` : e.sprites[k];
    if (!src) break;
    sprites.push(src);
  }
  e.sprites = sprites;
  console.info(`packs/${id}: ${sprites.length} stages`, sprites);
}
async function loadAssets() {
  const list = Object.entries(D.enemies);
  await Promise.all(list.map(([id, e]) => findPackStages(id, e)));
  await Promise.all(list.map(async ([id, e]) => {
    const stages = [];
    for (const src of e.sprites) {
      const img = await loadImage(src);
      stages.push({ img, white: tinted(img, '#ffffff'), red: tinted(img, '#ff2a2a'), dark: tinted(img, '#0a0610'), w: img.naturalWidth, h: img.naturalHeight });
    }
    assets[id] = { stages };
  }));
}
