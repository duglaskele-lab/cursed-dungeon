// Отрисовка боя: renderFight, противницы, сферы, HUD сверху и снизу, близкий кадр.
'use strict';

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
    ctx.strokeText(`${h.combo}`, W - 24, 248);              // ниже кнопки автобоя
    ctx.fillStyle = '#ffe2a8'; ctx.fillText(`${h.combo}`, W - 24, 248);
    ctx.font = `600 13px ${bodyFont}`; ctx.fillStyle = '#b9ae9c';
    ctx.fillText(t('hud.combo'), W - 24, 266);
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

// Иконки реликвий в ряд, каждая в ячейке, как в инвентаре; align 'right' — ряд заканчивается в x
function drawRelicIcons(ids, x, y, size, align = 'left') {
  const gap = 3, w = ids.length * (size + gap) - gap;
  let x0 = align === 'right' ? x - w : x;
  for (const id of ids) {
    ctx.fillStyle = '#120d09'; ctx.fillRect(x0, y, size, size);
    ctx.strokeStyle = 'rgba(160,125,60,.85)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y + 0.5, size - 1, size - 1);
    if (relicImgs[id]) ctx.drawImage(relicImgs[id], x0 + 1, y + 1, size - 2, size - 2);
    x0 += size + gap;
  }
  return w;
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
  if (h.relics.length) drawRelicIcons(h.relics, hx, y0 + 31, 21);

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
