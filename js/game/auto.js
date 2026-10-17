// Автобой: updateAuto/autoPlan — атакует и блокирует, не парирует и не захватывает.
'use strict';

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
