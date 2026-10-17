// Экран комнаты на этаже (двери, renderMap, drawDoor) и план этажа: drawFloorMap (мини и большой), туман, выбор двери.
'use strict';

// ---------------------------------------------------------------- этаж: экран комнаты
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
  if (rh.relics.length) drawRelicIcons(rh.relics, W - 20, 79, 19, 'right');
  else { ctx.textAlign = 'right'; ctx.fillStyle = '#c9b6f0'; ctx.fillText(t('map.noRelics'), W - 20, 92); }
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
