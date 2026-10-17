// Логика боя: newFight, удары, защита, броня, захват, сферы, помехи босса, обновление боя.
'use strict';

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
