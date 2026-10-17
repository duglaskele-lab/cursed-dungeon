// Этаж-граф: genFloor = layoutFloor + linkBands + assignRooms.
'use strict';

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
    captured: [], fights: 0, time: 0, events: shuffle(D.events.map((e) => e.id)), trans: null, doors: [], mapHits: []
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
