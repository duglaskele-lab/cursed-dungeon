// Состояние игры (G, fight, run, input), стадии брони, бонусы отряда (BONUS, withSquad).
'use strict';

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
