// Режим исследования: генерация подземелья, туман, ходьба, угроза и засады, монументы, отрисовка.
'use strict';

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
    captured: [], fights: 0, time: 0, events: shuffle(D.events.map((e) => e.id)), trans: null, doors: [], mapHits: []
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
