// Редактор противниц: свои героини без Python и правки кода.
// Обработка спрайтов в браузере, характеристики, тестовый бой, сохранение в браузере, экспорт в проект.
'use strict';
(function () {
  const CD = window.CD;
  if (!CD) return;
  const D = CD.D;
  const $ = (s, root = document) => root.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ================================================================ хранилище (IndexedDB, запасной вариант — память)
  const DB_NAME = 'cursed_dungeon', STORE = 'enemies';
  const mem = new Map();
  let dbPromise = null;
  let persistent = true;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB недоступна')); return; }
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch((e) => { persistent = false; console.warn('Свои противницы будут храниться только до перезагрузки:', e); return null; });
    return dbPromise;
  }
  function tx(db, mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      const out = fn(st);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  }
  async function dbAll() {
    const db = await openDB();
    if (!db) return [...mem.values()];
    return new Promise((res, rej) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }
  async function dbPut(rec) { const db = await openDB(); if (!db) { mem.set(rec.id, rec); return; } await tx(db, 'readwrite', (st) => st.put(rec)); }
  async function dbDel(id) { const db = await openDB(); if (!db) { mem.delete(id); return; } await tx(db, 'readwrite', (st) => st.delete(id)); }

  async function loadCustom() {
    const recs = await dbAll();
    for (const r of recs) {
      if (!r || !r.id || !r.data || CD.isBuiltin(r.id)) continue;
      D.enemies[r.id] = r.data;
      CD.applyFloor(r.id, r.data.floor);
    }
    return recs.length;
  }

  // ================================================================ обработка спрайтов
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Не удалось открыть картинку')); i.src = src; });
  }
  function readFile(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  }

  function detectBg(px, w, h) {
    let sum = 0;
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
      const i = (y * w + x) * 4;
      sum += px[i] + px[i + 1] + px[i + 2];
    }
    return sum / 12 > 127 ? 'white' : 'black';
  }

  // Убирает фон и возвращает {canvas, bgType}: картинка того же размера с прозрачным фоном
  function removeBackground(img, opts) {
    const w = img.naturalWidth, h = img.naturalHeight, N = w * h;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const idata = g.getImageData(0, 0, w, h);
    const px = idata.data;
    const bgType = opts.bg === 'auto' ? detectBg(px, w, h) : opts.bg;
    const white = bgType === 'white';
    // для белого фона по умолчанию нужен больший допуск (светлый ореол) и крупнее просветы
    const tol = white && opts.bg === 'auto' ? Math.max(opts.tol, 9) : opts.tol;
    const near = new Uint8Array(N), pure = new Uint8Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const r = px[j], gg = px[j + 1], b = px[j + 2];
      if (white) { const mn = Math.min(r, gg, b); near[i] = mn >= 255 - tol ? 1 : 0; pure[i] = mn >= 252 ? 1 : 0; }
      else { const mx = Math.max(r, gg, b); near[i] = mx <= tol ? 1 : 0; pure[i] = mx <= 3 ? 1 : 0; }
    }
    // заливка фона от краёв листа
    const bg = new Uint8Array(N);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    const seed = (i) => { if (near[i] && !bg[i]) { bg[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) {
      const i = q[qh++], x = i % w;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (i >= w) seed(i - w);
      if (i < N - w) seed(i + w);
    }
    // крупные замкнутые просветы чистого цвета фона (между руками и телом)
    const holeMin = white && opts.bg === 'auto' ? Math.max(opts.hole, 900) : opts.hole;
    const seen = new Uint8Array(N);
    for (let s = 0; s < N; s++) {
      if (!pure[s] || bg[s] || seen[s]) continue;
      qh = 0; qt = 0; seen[s] = 1; q[qt++] = s;
      while (qh < qt) {
        const i = q[qh++], x = i % w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < N - w ? i + w : -1];
        for (const k of nb) if (k >= 0 && pure[k] && !bg[k] && !seen[k]) { seen[k] = 1; q[qt++] = k; }
      }
      if (qt >= holeMin) for (let k = 0; k < qt; k++) bg[q[k]] = 1;
    }
    // полоса у края фигуры (2 пикселя) — мягкая альфа и «отмешивание» от фона
    const dil = (src) => {
      const out = src.slice();
      for (let i = 0; i < N; i++) {
        if (src[i]) continue;
        const x = i % w;
        if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (i >= w && src[i - w]) || (i < N - w && src[i + w])) out[i] = 1;
      }
      return out;
    };
    const band = dil(dil(bg));
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      if (bg[i]) { px[j + 3] = 0; continue; }
      if (!band[i]) { px[j + 3] = 255; continue; }
      const r = px[j], gg = px[j + 1], b = px[j + 2];
      if (white) {
        const a = clamp((255 - Math.min(r, gg, b)) / 150, 0, 1);
        const s = Math.max(a, 0.001);
        px[j] = clamp(255 - (255 - r) / s, 0, 255);
        px[j + 1] = clamp(255 - (255 - gg) / s, 0, 255);
        px[j + 2] = clamp(255 - (255 - b) / s, 0, 255);
        px[j + 3] = Math.round(a * 255);
      } else {
        px[j + 3] = Math.round(clamp(Math.max(r, gg, b) / 60, 0.55, 1) * 255);
      }
    }
    g.putImageData(idata, 0, 0);
    return { canvas: c, ctx: g, bgType, alpha: px, w, h };
  }

  // Делит лист на n фигур по пустым вертикальным промежуткам
  function splitFigures(res, n) {
    const { w, h, alpha } = res;
    const occ = new Uint32Array(w);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[(y * w + x) * 4 + 3] > 0) occ[x]++;
    let segs = [];
    let start = -1, prev = -10;
    for (let x = 0; x < w; x++) {
      if (!occ[x]) continue;
      if (start < 0) start = x;
      else if (x - prev > 6) { segs.push([start, prev + 1]); start = x; }
      prev = x;
    }
    if (start >= 0) segs.push([start, prev + 1]);
    let warn = '';
    while (segs.length > n) {
      let bi = 0, bg = 1e9;
      for (let i = 0; i < segs.length - 1; i++) { const gap = segs[i + 1][0] - segs[i][1]; if (gap < bg) { bg = gap; bi = i; } }
      segs[bi] = [segs[bi][0], segs[bi + 1][1]];
      segs.splice(bi + 1, 1);
    }
    if (segs.length < n) {
      warn = `Нашлось ${segs.length} фигур вместо ${n} — фигуры касаются друг друга. Лист разрезан на равные части, проверьте результат.`;
      const x0 = segs.length ? segs[0][0] : 0, x1 = segs.length ? segs[segs.length - 1][1] : w;
      const step = (x1 - x0) / n;
      segs = Array.from({ length: n }, (_, i) => [Math.round(x0 + i * step), Math.round(x0 + (i + 1) * step)]);
    }
    const figs = segs.map(([x0, x1]) => {
      const c = document.createElement('canvas'); c.width = x1 - x0; c.height = h;
      c.getContext('2d').drawImage(res.canvas, x0, 0, x1 - x0, h, 0, 0, x1 - x0, h);
      return c;
    });
    return { figs, warn };
  }

  // Одна фигура на картинку (режим «отдельные файлы»): обрезаем по ширине
  function singleFigure(res) {
    const { w, h, alpha } = res;
    let x0 = w, x1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (x1 < x0) { x0 = 0; x1 = w - 1; }
    const c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = h;
    c.getContext('2d').drawImage(res.canvas, x0, 0, c.width, h, 0, 0, c.width, h);
    return c;
  }

  function smallMask(canvas, s) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width / s)); c.height = Math.max(1, Math.round(canvas.height / s));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const m = new Uint8Array(c.width * c.height);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 60 ? 1 : 0;
    return { m, w: c.width, h: c.height };
  }
  function bestShift(a, b, R) {
    let best = [0, 0], bestS = -1;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        let inter = 0, uni = 0;
        for (let y = 0; y < a.h; y++) {
          const yb = y - dy;
          for (let x = 0; x < a.w; x++) {
            const xb = x - dx;
            const va = a.m[y * a.w + x];
            const vb = yb >= 0 && yb < b.h && xb >= 0 && xb < b.w ? b.m[yb * b.w + xb] : 0;
            if (va || vb) { uni++; if (va && vb) inter++; }
          }
        }
        const s = inter / Math.max(1, uni);
        if (s > bestS) { bestS = s; best = [dx, dy]; }
      }
    }
    return { dx: best[0], dy: best[1], score: bestS };
  }

  // Ставит фигуры на общий холст (низ по низу), выравнивает по первой стадии, обрезает по общему контуру
  function composeStages(figs, maxH) {
    const H = Math.max(...figs.map((f) => f.height));
    const Wc = Math.max(...figs.map((f) => f.width)) + 80;
    let cans = figs.map((f) => {
      const c = document.createElement('canvas'); c.width = Wc; c.height = H;
      c.getContext('2d').drawImage(f, Math.round((Wc - f.width) / 2), H - f.height);
      return c;
    });
    const S = 4;
    const m0 = smallMask(cans[0], S);
    const notes = [];
    cans = cans.map((c, i) => {
      if (!i) return c;
      const r = bestShift(m0, smallMask(c, S), 10);
      const dx = r.dx * S, dy = Math.abs(r.dy) <= 1 ? 0 : r.dy * S;
      notes.push(`стадия ${i + 1}: сдвиг ${dx}, ${dy} · совпадение ${(r.score * 100).toFixed(0)}%`);
      if (!dx && !dy) return c;
      const n = document.createElement('canvas'); n.width = Wc; n.height = H;
      n.getContext('2d').drawImage(c, dx, dy);
      return n;
    });
    let x0 = Wc, x1 = 0, y0 = H;
    for (const c of cans) {
      const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, Wc, H).data;
      for (let y = 0; y < H; y++) for (let x = 0; x < Wc; x++) if (d[(y * Wc + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
    }
    const pad = 12;
    x0 = Math.max(0, x0 - pad); x1 = Math.min(Wc - 1, x1 + pad); y0 = Math.max(0, y0 - pad);
    const cw = x1 - x0 + 1, ch = H - y0;
    const sc = ch > maxH ? maxH / ch : 1;
    const out = cans.map((c) => {
      const o = document.createElement('canvas'); o.width = Math.round(cw * sc); o.height = Math.round(ch * sc);
      const g = o.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, x0, y0, cw, ch, 0, 0, o.width, o.height);
      return o;
    });
    return { canvases: out, notes };
  }

  // ================================================================ данные и форма
  const FIELDS = [
    { k: 'name', label: 'Имя', type: 'text' },
    { k: 'id', label: 'ID (латиница, для файлов)', type: 'text' },
    { k: 'subtitle', label: 'Подпись', type: 'text', full: true },
    { k: 'about', label: 'Описание (видно в меню)', type: 'area', full: true },
    { k: 'kind', label: 'Тип', type: 'select', options: [['normal', 'Обычная'], ['elite', 'Элита'], ['boss', 'Босс']] },
    { k: 'xp', label: 'Опыт за победу', type: 'num', step: 5 },
    { k: 'armor', label: 'Частей брони', type: 'num', step: 1 },
    { k: 'chest', label: 'Высота груди (доля роста, 0.5–0.8)', type: 'num', step: 0.02 },
    { k: 'hp', label: 'Здоровье (1 ур.)', type: 'num', step: 50 },
    { k: 'stamina', label: 'Выносливость (1 ур.)', type: 'num', step: 10 },
    { k: 'stamRegen', label: 'Восст. выносливости /с', type: 'num', step: 1 },
    { k: 'attack.dmg', label: 'Урон удара', type: 'num', step: 1 },
    { k: 'attack.telegraph', label: 'Замах, с', type: 'num', step: 0.05 },
    { k: 'attack.follow', label: 'Замах в серии, с', type: 'num', step: 0.05 },
    { k: 'attack.interval', label: 'Пауза между атаками, с', type: 'pair', step: 0.1 },
    { k: 'attack.strikes', label: 'Ударов в серии', type: 'pair', step: 1 },
    { k: 'spheres.every', label: 'Сферы каждые, с', type: 'pair', step: 0.5 },
    { k: 'spheres.count', label: 'Сфер за раз', type: 'pair', step: 1 },
    { k: 'spheres.grow', label: 'Сфера растёт, с', type: 'pair', step: 0.1 },
    { k: 'spheres.elements', label: 'Стихии сфер', type: 'elements', full: true },
    { k: 'rage', label: 'Ярость: после поломки брони атакует чаще', type: 'check', full: true },
    { k: 'bossVines', label: 'Босс: помехи со 2-й фазы (тянутся к центру, срезаются росчерком)', type: 'check', full: true, boss: true },
    { k: 'hazard', label: 'Босс: вид помех', type: 'select', options: [['wisps', 'Призрачные огоньки'], ['vines', 'Лианы']], boss: true },
    { k: 'intro', label: 'Босс: реплика перед боем', type: 'area', full: true, boss: true }
  ];
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.');
    let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  }

  const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  function slug(name) {
    let s = String(name).toLowerCase().split('').map((c) => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : c)).join('');
    s = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!/^[a-z]/.test(s)) s = 'enemy_' + s;
    return s.slice(0, 32) || 'enemy';
  }

  function templateData(id) {
    const t = JSON.parse(JSON.stringify(D.enemies[id]));
    delete t.sprites; delete t.phases; delete t.floor; delete t.custom;
    t.spheres = t.spheres || { every: [7, 9], count: [2, 3], grow: [3.5, 4.5], elements: ['fire'] };
    t.attack.follow = t.attack.follow || Math.max(0.6, t.attack.telegraph * 0.7);
    t.armor = t.armor || Math.max(1, (D.enemies[id].sprites || []).length - 1);
    t.chest = t.chest || 0.62;
    return t;
  }

  function makePhases(d, n) {
    const ph = [{ title: d.name, sub: 'Фаза 1' }];
    for (let i = 1; i < n; i++) {
      const k = Math.pow(0.88, i);
      const p = {
        title: `Фаза ${i + 1} — ${i === n - 1 ? 'Ярость' : 'Натиск'}`,
        sub: i === n - 1 ? 'Без брони: быстрее и злее' : 'Серии ударов',
        attack: {
          strikes: [Math.max(2, d.attack.strikes[0]), Math.max(3, d.attack.strikes[1])],
          interval: d.attack.interval.map((v) => +(v * k).toFixed(2)),
          telegraph: +Math.max(0.6, d.attack.telegraph * Math.pow(0.93, i)).toFixed(2),
          follow: +Math.max(0.55, d.attack.follow * Math.pow(0.93, i)).toFixed(2)
        }
      };
      if (d.bossVines) p.vines = { every: [Math.max(5, 11 - 2 * i), Math.max(7, 14 - 2 * i)] };
      if (i === n - 1) p.spheres = { every: d.spheres.every.map((v) => +(v * 0.75).toFixed(1)) };
      ph.push(p);
    }
    return ph;
  }

  // ================================================================ интерфейс
  const root = $('#editor');
  const state = { editingId: null, images: [], source: null, tempId: null, dirty: false, list: [] };

  root.innerHTML = `
    <h1>Редактор противниц</h1>
    <div class="sub" id="edPersist">Свои героини сохраняются в этом браузере</div>
    <div class="section-title">Мои противницы</div>
    <div class="ed-list" id="edList"></div>
    <div class="btn-row">
      <button class="btn" id="edNew">Новая противница</button>
      <button class="btn ghost" id="edImport">Загрузить набор</button>
    </div>
    <input type="file" id="edImportFile" accept=".json,application/json" hidden>

    <div id="edForm" class="hidden">
      <div class="section-title">1. Спрайты стадий</div>
      <div class="ed-grid">
        <label class="ed-file full">Лист со всеми стадиями в ряд<br><b>выбрать файл</b><input type="file" id="edSheet" accept="image/*"></label>
        <label class="ed-file full">…или отдельные картинки стадий по порядку<br><b>выбрать файлы</b><input type="file" id="edFiles" accept="image/*" multiple></label>
        <label class="ed-f">Стадий на листе
          <select id="edStages"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>
        <label class="ed-f">Фон
          <select id="edBg"><option value="auto">определить сам</option><option value="black">чёрный</option><option value="white">белый</option></select></label>
        <label class="ed-f">Допуск фона: <span id="edTolV">6</span>
          <input type="range" id="edTol" min="2" max="40" value="6"></label>
        <label class="ed-f">Мин. просвет (пикс.): <span id="edHoleV">400</span>
          <input type="range" id="edHole" min="50" max="5000" step="50" value="400"></label>
      </div>
      <div class="ed-note">Стадии — от целой брони к «сломлена». Можно загрузить и один спрайт: частей брони задаётся отдельно, а спрайты меняются по мере поломки. Если по краю остался ореол фона — увеличьте допуск; если пропали тёмные или светлые детали рисунка — уменьшите.</div>
      <button class="btn ghost" id="edProcess">Обработать заново</button>
      <div class="ed-status" id="edStatus"></div>
      <div class="ed-thumbs" id="edThumbs"></div>

      <div class="section-title">2. Характеристики</div>
      <div class="ed-grid">
        <label class="ed-f full">Взять за основу
          <select id="edTemplate"></select></label>
      </div>
      <div class="ed-grid" id="edFields" style="margin-top: calc(var(--u)*10)"></div>

      <div class="section-title">3. Где появляется в забеге</div>
      <div class="ed-checks" id="edFloor"></div>
      <div class="ed-note">Обычные бои — в выбранных слоях этажа. Элита и босс выбираются случайно среди всех отмеченных.</div>

      <div class="section-title">4. Проверка и сохранение</div>
      <div class="ed-grid">
        <label class="ed-f">Тест: уровень героя<input type="number" id="edTestH" min="1" max="10" value="1"></label>
        <label class="ed-f">Тест: уровень противницы<input type="number" id="edTestE" min="1" max="10" value="1"></label>
      </div>
      <div class="btn-row">
        <button class="btn" id="edSave">Сохранить</button>
        <button class="btn ghost" id="edTest">Тестовый бой</button>
      </div>
      <div class="btn-row">
        <button class="mini" id="edZip">Экспорт в проект (.zip)</button>
        <button class="mini" id="edPack">Скачать набор (.json)</button>
        <button class="mini danger hidden" id="edDelete">Удалить</button>
      </div>
      <div class="ed-status" id="edSaveStatus"></div>
    </div>

    <button class="btn ghost" id="edClose">Назад в меню</button>
  `;

  // поля формы
  const fieldsBox = $('#edFields', root);
  for (const f of FIELDS) {
    const wrap = document.createElement(f.type === 'elements' ? 'div' : 'label');   // без вложенных label
    wrap.className = 'ed-f' + (f.full ? ' full' : '');
    wrap.dataset.k = f.k;
    if (f.boss) wrap.dataset.boss = '1';
    let inner = '';
    if (f.type === 'text') inner = `<input type="text" data-f="${f.k}">`;
    if (f.type === 'num') inner = `<input type="number" step="${f.step}" data-f="${f.k}">`;
    if (f.type === 'area') inner = `<textarea data-f="${f.k}"></textarea>`;
    if (f.type === 'select') inner = `<select data-f="${f.k}">${f.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    if (f.type === 'pair') inner = `<div class="ed-pair"><input type="number" step="${f.step}" data-f="${f.k}.0" title="от"><input type="number" step="${f.step}" data-f="${f.k}.1" title="до"></div>`;
    if (f.type === 'elements') inner = `<div class="ed-checks">${Object.entries(D.elements).map(([k, e]) => `<label><input type="checkbox" data-el="${k}"><span><b style="color:${e.color};font-weight:600">${e.name}</b> — ${e.effect.toLowerCase()}</span></label>`).join('')}</div>`;
    if (f.type === 'check') {
      const box = document.createElement('div');
      box.className = 'ed-checks full';
      box.dataset.k = f.k;
      if (f.boss) box.dataset.boss = '1';
      box.innerHTML = `<label><input type="checkbox" data-f="${f.k}"><span>${f.label}</span></label>`;
      fieldsBox.appendChild(box);
      continue;
    }
    wrap.innerHTML = `${f.label}${f.type === 'pair' ? ' (от / до)' : ''}${inner}`;
    fieldsBox.appendChild(wrap);
  }
  const tplSel = $('#edTemplate', root);
  const floorBox = $('#edFloor', root);
  function fillStatic() {
    tplSel.innerHTML = '<option value="">— не менять —</option>' + Object.entries(D.enemies)
      .filter(([id]) => CD.isBuiltin(id)).map(([id, e]) => `<option value="${id}">${esc(e.name)}${e.kind === 'boss' ? ' (босс)' : e.kind === 'elite' ? ' (элита)' : ''}</option>`).join('');
    floorBox.innerHTML = D.floor.layers.map((L, i) => (L.pool ? `<label><input type="checkbox" data-layer="${i}"> Слой ${i + 1} (ур. ${L.lvl})</label>` : '')).join('')
      + '<label><input type="checkbox" data-floor="elite"> Элита этажа</label><label><input type="checkbox" data-floor="boss"> Босс этажа</label>';
  }

  function setStatus(id, text, cls = '') { const el = $(id, root); el.textContent = text; el.className = 'ed-status' + (cls ? ' ' + cls : ''); }

  function updateBossFields() {
    const boss = $('[data-f="kind"]', root).value === 'boss';
    root.querySelectorAll('[data-boss]').forEach((el) => el.classList.toggle('hidden', !boss));
  }

  function dataToForm(d) {
    for (const el of root.querySelectorAll('#edFields [data-f]')) {
      const v = getPath(d, el.dataset.f);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    }
    const els = (d.spheres && d.spheres.elements) || [];
    root.querySelectorAll('[data-el]').forEach((cb) => { cb.checked = els.includes(cb.dataset.el); });
    const fl = d.floor || {};
    root.querySelectorAll('[data-layer]').forEach((cb) => { cb.checked = (fl.layers || []).includes(Number(cb.dataset.layer)); });
    root.querySelectorAll('[data-floor]').forEach((cb) => { cb.checked = !!fl[cb.dataset.floor]; });
    updateBossFields();
  }

  function formToData() {
    const d = { custom: true, offsetX: 0, attack: {}, spheres: {} };
    for (const el of root.querySelectorAll('#edFields [data-f]')) {
      const k = el.dataset.f;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') v = el.value === '' ? 0 : Number(el.value);
      else v = el.value.trim();
      if (/\.\d$/.test(k)) {
        const base = k.slice(0, -2), idx = Number(k.slice(-1));
        const arr = getPath(d, base) || [];
        arr[idx] = v;
        setPath(d, base, arr);
      } else setPath(d, k, v);
    }
    d.spheres.elements = [...root.querySelectorAll('[data-el]:checked')].map((cb) => cb.dataset.el);
    d.floor = {
      layers: [...root.querySelectorAll('[data-layer]:checked')].map((cb) => Number(cb.dataset.layer)),
      elite: $('[data-floor="elite"]', root).checked,
      boss: $('[data-floor="boss"]', root).checked
    };
    // нормализация: пары по возрастанию, разумные пределы
    for (const p of ['attack.interval', 'attack.strikes', 'spheres.every', 'spheres.count', 'spheres.grow']) {
      const a = getPath(d, p).map((x) => Math.max(0, Number(x) || 0));
      a.sort((x, y) => x - y);
      setPath(d, p, a);
    }
    d.attack.strikes = d.attack.strikes.map((x) => clamp(Math.round(x), 1, 5));
    d.spheres.count = d.spheres.count.map((x) => clamp(Math.round(x), 0, 5));
    d.attack.telegraph = clamp(d.attack.telegraph, 0.4, 3);
    d.attack.follow = clamp(d.attack.follow || d.attack.telegraph * 0.7, 0.35, 3);
    d.attack.interval = d.attack.interval.map((x) => clamp(x, 0.5, 10));
    d.spheres.every = d.spheres.every.map((x) => clamp(x, 1.5, 60));
    d.spheres.grow = d.spheres.grow.map((x) => clamp(x, 1.5, 15));
    d.hp = Math.max(50, d.hp); d.stamina = Math.max(20, d.stamina);
    d.armor = clamp(Math.round(d.armor || 2), 1, 5);
    d.chest = clamp(d.chest || 0.62, 0.4, 0.85);
    if (!d.spheres.elements.length) { d.spheres.elements = ['fire']; d.spheres.count = [0, 0]; }
    d.sprites = state.images.slice();
    if (d.kind === 'boss') {
      d.phases = makePhases(d, d.armor + 1);
      d.intro = d.intro || `«${d.name} не выпустит тебя отсюда!»`;
    } else { delete d.phases; }
    return d;
  }

  function validate(d) {
    if (state.images.length < 1) return 'Загрузите и обработайте хотя бы один спрайт.';
    if (!d.name) return 'Укажите имя.';
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(d.id || '')) return 'ID: латинские буквы, цифры и _, начинается с буквы.';
    if (CD.isBuiltin(d.id)) return `ID «${d.id}» занят встроенной противницей — выберите другой.`;
    if (d.id !== state.editingId && state.list.some((r) => r.id === d.id)) return `ID «${d.id}» уже есть среди ваших противниц.`;
    return '';
  }

  function renderThumbs() {
    const box = $('#edThumbs', root);
    box.innerHTML = state.images.map((src, i) => `<figure><img src="${src}" alt=""><figcaption>${state.images.length === 1 ? 'единственный спрайт' : i === 0 ? 'целая' : i === state.images.length - 1 ? 'сломлена' : `стадия ${i + 1}`}</figcaption></figure>`).join('');
  }

  async function processSource() {
    const src = state.source;
    if (!src) { setStatus('#edStatus', 'Сначала выберите лист или файлы стадий.', 'err'); return; }
    const opts = { bg: $('#edBg', root).value, tol: Number($('#edTol', root).value), hole: Number($('#edHole', root).value) };
    setStatus('#edStatus', 'Обрабатываю…');
    await new Promise((r) => setTimeout(r, 30));
    try {
      let figs, warn = '', bgType = '';
      if (src.type === 'sheet') {
        const res = removeBackground(src.imgs[0], opts);
        bgType = res.bgType;
        ({ figs, warn } = splitFigures(res, Number($('#edStages', root).value)));
      } else {
        figs = src.imgs.map((img) => { const r = removeBackground(img, opts); bgType = r.bgType; return singleFigure(r); });
      }
      const { canvases, notes } = composeStages(figs, 1400);
      state.images = canvases.map((c) => c.toDataURL('image/png'));
      state.dirty = true;
      renderThumbs();
      const c0 = canvases[0];
      setStatus('#edStatus', [`Готово: ${canvases.length} стадий ${c0.width}×${c0.height}, фон — ${bgType === 'white' ? 'белый' : 'чёрный'}.`, ...notes, warn].filter(Boolean).join('\n'), warn ? 'err' : 'ok');
    } catch (err) {
      console.error(err);
      setStatus('#edStatus', 'Не получилось обработать: ' + err.message, 'err');
    }
  }

  async function onSheet(file) {
    if (!file) return;
    const img = await loadImg(await readFile(file));
    state.source = { type: 'sheet', imgs: [img] };
    if (!$('[data-f="name"]', root).value || $('[data-f="name"]', root).value === 'Новая противница') {
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]?sheet$/i, '');
      $('[data-f="name"]', root).value = base.charAt(0).toUpperCase() + base.slice(1);
      $('[data-f="id"]', root).value = slug(base);
    }
    await processSource();
  }
  async function onFiles(files) {
    if (!files || !files.length) return;
    const list = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const imgs = [];
    for (const f of list) imgs.push(await loadImg(await readFile(f)));
    state.source = { type: 'files', imgs };
    await processSource();
  }

  async function refreshList() {
    state.list = (await dbAll()).filter((r) => r && r.data);
    const box = $('#edList', root);
    if (!state.list.length) { box.innerHTML = '<div class="ed-note">Пока нет своих противниц. Нажмите «Новая противница» и загрузите лист со стадиями.</div>'; return; }
    box.innerHTML = '';
    for (const r of state.list) {
      const d = r.data;
      const row = document.createElement('div');
      row.className = 'ed-item';
      row.innerHTML = `<img src="${d.sprites[0]}" alt=""><div><div class="nm">${esc(d.name)}</div><div class="ds">${d.kind === 'boss' ? 'Босс' : d.kind === 'elite' ? 'Элита' : 'Обычная'} · брони ${d.armor || d.sprites.length - 1} · спрайтов ${d.sprites.length} · ID ${esc(r.id)}</div></div>
        <div class="acts"><button class="mini" data-a="edit">Изменить</button><button class="mini" data-a="fight">Бой</button></div>`;
      row.querySelector('[data-a="edit"]').addEventListener('click', () => editRecord(r));
      row.querySelector('[data-a="fight"]').addEventListener('click', () => { leaveForTest(r.id, 1, 1); });
      box.appendChild(row);
    }
  }

  function newEnemy() {
    state.editingId = null; state.images = []; state.source = null; state.dirty = false;
    const d = templateData(Object.keys(D.enemies).find((k) => CD.isBuiltin(k) && D.enemies[k].kind === 'normal') || Object.keys(D.enemies)[0]);
    d.name = 'Новая противница'; d.id = ''; d.subtitle = 'Своя героиня'; d.about = 'Описание противницы.'; d.kind = 'normal';
    d.floor = { layers: [0, 1], elite: false, boss: false };
    dataToForm(d);
    renderThumbs();
    setStatus('#edStatus', 'Выберите лист со стадиями (или отдельные файлы).');
    setStatus('#edSaveStatus', '');
    $('#edDelete', root).classList.add('hidden');
    $('#edForm', root).classList.remove('hidden');
    $('#edForm', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function editRecord(r) {
    state.editingId = r.id; state.images = r.data.sprites.slice(); state.source = null; state.dirty = false;
    dataToForm({ ...r.data, id: r.id });
    renderThumbs();
    setStatus('#edStatus', 'Чтобы заменить спрайты, выберите новый лист или файлы.');
    setStatus('#edSaveStatus', '');
    $('#edDelete', root).classList.remove('hidden');
    $('#edForm', root).classList.remove('hidden');
    $('#edForm', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function save() {
    const d = formToData();
    const err = validate(d);
    if (err) { setStatus('#edSaveStatus', err, 'err'); return null; }
    const id = d.id;
    delete d.id;
    try {
      if (state.editingId && state.editingId !== id) { await dbDel(state.editingId); CD.unregisterEnemy(state.editingId); }
      await dbPut({ id, data: d, savedAt: Date.now() });
      await CD.registerEnemy(id, d);
    } catch (e) {
      setStatus('#edSaveStatus', 'Не удалось сохранить: ' + e.message, 'err');
      return null;
    }
    state.editingId = id; state.tempId = null; state.dirty = false;
    $('#edDelete', root).classList.remove('hidden');
    await refreshList();
    setStatus('#edSaveStatus', persistent ? `Сохранено. «${d.name}» уже есть в меню тренировки${d.floor.layers.length || d.floor.elite || d.floor.boss ? ' и в забеге' : ''}.` : 'Сохранено только до перезагрузки страницы: браузер не дал доступ к хранилищу. Скачайте набор, чтобы не потерять.', persistent ? 'ok' : 'err');
    return id;
  }

  async function test() {
    const d = formToData();
    const err = validate(d);
    if (err) { setStatus('#edSaveStatus', err, 'err'); return; }
    const id = d.id;
    delete d.id;
    await CD.registerEnemy(id, d);
    if (!state.list.some((r) => r.id === id)) state.tempId = id;
    leaveForTest(id, clamp(Number($('#edTestH', root).value) || 1, 1, 10), clamp(Number($('#edTestE', root).value) || 1, 1, 10));
  }

  function leaveForTest(id, h, e) {
    CD.G.returnTo = 'editor';
    CD.hide(root);
    CD.startTraining(id, h, e);
  }

  async function del() {
    const id = state.editingId;
    if (!id || !confirm(`Удалить «${$('[data-f="name"]', root).value}»? Это нельзя отменить.`)) return;
    await dbDel(id);
    CD.unregisterEnemy(id);
    state.editingId = null;
    $('#edForm', root).classList.add('hidden');
    await refreshList();
  }

  // ---------------------------------------------------------------- экспорт и обмен
  function dataUrlBytes(url) {
    const b64 = url.split(',')[1];
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  // ZIP без сжатия (store) — без сторонних библиотек
  function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function exportZip() {
    const d = formToData();
    const err = validate(d);
    if (err) { setStatus('#edSaveStatus', err, 'err'); return; }
    const id = d.id;
    const entry = { ...d };
    delete entry.id; delete entry.custom; delete entry.floor; delete entry.bossVines;
    entry.sprites = d.sprites.map((_, i) => `assets/${id}/stage${i + 1}.png`);
    const json = JSON.stringify(entry, null, 2)
      .replace(/\[\s+([^\[\]{}]*?)\s+\]/g, (m, inner) => '[' + inner.replace(/\s+/g, ' ') + ']')
      .replace(/\n/g, '\n    ');
    const fl = d.floor;
    const floorLines = [
      ...fl.layers.map((i) => `//   floor.layers[${i}].pool — добавьте '${id}'`),
      fl.elite ? `//   floor.elite — добавьте '${id}' (сделайте массивом: ['wolf', '${id}'])` : '',
      fl.boss ? `//   floor.layers[4].boss — добавьте '${id}' (массивом: ['nekomata', '${id}'])` : ''
    ].filter(Boolean);
    const snippet = `// ${d.name} — запись для js/data.js\n// 1. Скопируйте папку assets/${id} в папку assets игры.\n// 2. Вставьте строку ниже внутрь enemies: { ... } в js/data.js.\n${floorLines.length ? '// 3. Чтобы она появлялась в забеге:\n' + floorLines.join('\n') + '\n' : ''}\n    ${id}: ${json},\n`;
    const files = d.sprites.map((src, i) => ({ name: `assets/${id}/stage${i + 1}.png`, data: dataUrlBytes(src) }));
    files.push({ name: `${id}.data.js`, data: snippet });
    download(makeZip(files), `${id}.zip`);
    setStatus('#edSaveStatus', `Скачан ${id}.zip: спрайты и запись для data.js с инструкцией.`, 'ok');
  }

  function exportPack() {
    const d = formToData();
    const err = validate(d);
    if (err) { setStatus('#edSaveStatus', err, 'err'); return; }
    const id = d.id;
    delete d.id;
    const pack = { format: 'cursed-dungeon-enemies', version: 1, enemies: [{ id, data: d }] };
    download(new Blob([JSON.stringify(pack)], { type: 'application/json' }), `${id}.enemy.json`);
    setStatus('#edSaveStatus', `Скачан ${id}.enemy.json — его можно загрузить в редактор на другом устройстве.`, 'ok');
  }

  async function importPack(file) {
    if (!file) return;
    try {
      const pack = JSON.parse(await file.text());
      if (pack.format !== 'cursed-dungeon-enemies' || !Array.isArray(pack.enemies)) throw new Error('это не набор противниц');
      let n = 0;
      for (const r of pack.enemies) {
        if (!r.id || !r.data || !Array.isArray(r.data.sprites) || r.data.sprites.length < 1) continue;
        let id = r.id;
        if (CD.isBuiltin(id)) id = id + '_custom';
        r.data.custom = true;
        await dbPut({ id, data: r.data, savedAt: Date.now() });
        await CD.registerEnemy(id, r.data);
        n++;
      }
      await refreshList();
      alert(`Загружено противниц: ${n}`);
    } catch (e) {
      alert('Не удалось загрузить набор: ' + e.message);
    }
  }

  // ---------------------------------------------------------------- события
  $('#edNew', root).addEventListener('click', newEnemy);
  $('#edImport', root).addEventListener('click', () => $('#edImportFile', root).click());
  $('#edImportFile', root).addEventListener('change', (e) => { importPack(e.target.files[0]); e.target.value = ''; });
  $('#edSheet', root).addEventListener('change', (e) => { onSheet(e.target.files[0]); e.target.value = ''; });
  $('#edFiles', root).addEventListener('change', (e) => { onFiles(e.target.files); e.target.value = ''; });
  $('#edProcess', root).addEventListener('click', processSource);
  $('#edTol', root).addEventListener('input', (e) => { $('#edTolV', root).textContent = e.target.value; });
  $('#edHole', root).addEventListener('input', (e) => { $('#edHoleV', root).textContent = e.target.value; });
  $('#edBg', root).addEventListener('change', (e) => {
    const t = $('#edTol', root);
    if (e.target.value === 'white' && Number(t.value) < 9) { t.value = 9; $('#edTolV', root).textContent = 9; }
    if (e.target.value === 'white' && Number($('#edHole', root).value) < 900) { $('#edHole', root).value = 900; $('#edHoleV', root).textContent = 900; }
  });
  $('[data-f="kind"]', root).addEventListener('change', (e) => {
    // разумные отметки этажа по типу: босс — только босс этажа, элита — только элита
    const k = e.target.value;
    root.querySelectorAll('[data-layer]').forEach((cb) => { if (k !== 'normal') cb.checked = false; });
    $('[data-floor="elite"]', root).checked = k === 'elite';
    $('[data-floor="boss"]', root).checked = k === 'boss';
    updateBossFields();
  });
  $('[data-f="name"]', root).addEventListener('input', (e) => {
    const idEl = $('[data-f="id"]', root);
    if (!state.editingId && (!idEl.value || idEl.dataset.auto === '1')) { idEl.value = slug(e.target.value); idEl.dataset.auto = '1'; }
  });
  $('[data-f="id"]', root).addEventListener('input', (e) => { e.target.dataset.auto = '0'; });
  tplSel.addEventListener('change', () => {
    if (!tplSel.value) return;
    const keep = formToData();
    const t = templateData(tplSel.value);
    dataToForm({ ...t, name: $('[data-f="name"]', root).value, id: $('[data-f="id"]', root).value, subtitle: keep.subtitle, about: keep.about, floor: keep.floor, intro: keep.intro });
    tplSel.value = '';
    setStatus('#edSaveStatus', 'Характеристики взяты из шаблона. Имя, описание и размещение остались прежними.', 'ok');
  });
  $('#edSave', root).addEventListener('click', save);
  $('#edTest', root).addEventListener('click', test);
  $('#edZip', root).addEventListener('click', exportZip);
  $('#edPack', root).addEventListener('click', exportPack);
  $('#edDelete', root).addEventListener('click', del);
  $('#edClose', root).addEventListener('click', close);

  async function open() {
    CD.hideAll();
    fillStatic();
    $('#edPersist', root).textContent = persistent ? 'Свои героини сохраняются в этом браузере' : 'Браузер не дал доступ к хранилищу: сохранения живут до перезагрузки — скачивайте наборы';
    CD.show(root);
    await refreshList();
  }
  function close() {
    // несохранённая противница из тестового боя не должна оставаться в игре
    if (state.tempId && !state.list.some((r) => r.id === state.tempId)) CD.unregisterEnemy(state.tempId);
    state.tempId = null;
    CD.hide(root);
    CD.toMenu();
  }

  document.querySelector('#editorBtn').addEventListener('click', () => { CD.sfx.ensure(); open(); });

  window.CDEditor = {
    open, loadCustom,
    // для автотестов
    _state: state, _processSource: processSource, _onSheetImage: async (src) => { const img = await loadImg(src); state.source = { type: 'sheet', imgs: [img] }; await processSource(); },
    _save: save, _formToData: formToData
  };
})();
