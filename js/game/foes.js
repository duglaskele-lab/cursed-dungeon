// Противницы в бою: makeFoe, расстановка foeLayout/layoutFoes, posRect; эффекты (частицы, тексты).
'use strict';

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
// Передняя ближе к камере (крупный план, ноги уходят под нижнюю панель) — и одна, и в группе;
// задние — за ней ближе к центру, дальше по полу; фон приближается (BG_GROUP_ZOOM), чтобы зал был шире
const BG_GROUP_ZOOM = 1.42;
function foeLayout(foe) {
  const backs = backFoes();
  let x = 0.5, s = 1, bottom = HUD_BOTTOM + 6;
  if (foe.slot === 'front') {
    // передняя всегда крупным планом (cowboy shot): ноги уходят под нижнюю панель
    s = 1.15; bottom += foe.base.h * s * 0.22;
    if (backs.length === 1) x = backs[0].slot === 'left' ? 0.56 : 0.44;
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
