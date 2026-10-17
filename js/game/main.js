// Главный цикл, API для редактора (window.CD), хук автотестов (window.__proto), запуск.
'use strict';

// ---------------------------------------------------------------- цикл
function update(dt) {
  G.time += dt;
  if (G.mode === 'fight' && fight) updateFight(dt);
  else if (G.mode === 'map' && run) updateMap(dt);
  else if (G.mode === 'explore' && run) updateExplore(dt);
}
function render() {
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!BG.themes.dungeon) return;
  if ((G.mode === 'fight' || G.mode === 'result') && fight) renderFight();
  else if (G.mode === 'map' && run) renderMap();
  else if (G.mode === 'explore' && run) renderExplore();
  else { drawBackground('dungeon', G.time); drawForeground('dungeon'); }
  if (G.speed > 1) {
    ctx.textAlign = 'left'; ctx.font = `700 13px ${bodyFont}`; ctx.fillStyle = '#ffd060';
    ctx.fillText('▶▶ ×' + G.speed, 12, H - 30);
  }
}
let last = performance.now();
// кнопка автобоя видна только в идущем бою
let autoShown = null;
function syncAutoBtn() {
  const vis = G.mode === 'fight' && fight && !fight.over && !G.paused && !G.panelOpen;
  if (vis !== autoShown) { autoShown = vis; ui.autoBtn.classList.toggle('hidden', !vis); }
  ui.autoBtn.classList.toggle('on', !!G.auto);
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  syncAutoBtn();
  if (!G.paused) for (let i = 0; i < G.speed; i++) update(dt);      // ускоренный режим — несколько шагов за кадр
  render();
  requestAnimationFrame(frame);
}

async function boot() {
  resize();
  buildTheme('dungeon');
  buildTheme('jungle');
  buildTheme('spirit');
  requestAnimationFrame(frame);
  // свои противницы из редактора (хранятся в браузере)
  if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  if (window.CDEditor) { try { await window.CDEditor.loadCustom(); } catch (e) { console.warn('Custom opponents failed to load', e); } }
  try {
    await loadAssets();
  } catch (err) {
    ui.loading.innerHTML = `${t('err.sprites')}<div class="err">${err.message}.<br>${t('err.spritesHint')}</div>`;
    return;
  }
  hide(ui.loading);
  G.mode = 'menu';
  buildMenu();
  show(ui.menu);
}

// ---------------------------------------------------------------- API для редактора противниц
D.floor.elite = [].concat(D.floor.elite);
D.floor.boss = [].concat(D.floor.boss);
const BUILTIN = new Set(Object.keys(D.enemies));
function removeFromFloor(id) {
  D.floor.zones.forEach((z) => { z.pool = z.pool.filter((x) => x !== id); });
  D.floor.elite = D.floor.elite.filter((x) => x !== id);
  D.floor.boss = D.floor.boss.filter((x) => x !== id);
}
// fl.zones — номера зон этажа; у старых сохранений редактора были fl.layers (слои прежнего этажа)
function floorZones(fl) {
  if (fl.zones) return fl.zones;
  return (fl.layers || []).map((i) => Math.min(i === 2 ? 1 : i, D.floor.zones.length - 1));
}
function applyFloor(id, fl = {}) {
  removeFromFloor(id);
  floorZones(fl).forEach((i) => { const z = D.floor.zones[i]; if (z && !z.pool.includes(id)) z.pool.push(id); });
  if (fl.elite) D.floor.elite.push(id);
  if (fl.boss) D.floor.boss.push(id);
}
async function registerEnemy(id, data) {
  const stages = [];
  for (const src of data.sprites) {
    const img = await loadImage(src);
    stages.push({ img, white: tinted(img, '#ffffff'), red: tinted(img, '#ff2a2a'), dark: tinted(img, '#0a0610'), w: img.naturalWidth, h: img.naturalHeight });
  }
  assets[id] = { stages };
  D.enemies[id] = data;
  applyFloor(id, data.floor);
}
function unregisterEnemy(id) {
  if (BUILTIN.has(id)) return;
  delete D.enemies[id]; delete assets[id];
  removeFromFloor(id);
  if (G.selected === id) G.selected = Object.keys(D.enemies)[0];
}
window.CD = {
  D, G, sfx, ui, show, hide, isBuiltin: (id) => BUILTIN.has(id),
  registerEnemy, unregisterEnemy, applyFloor, floorZones,
  hideAll: hideAllOverlays, toMenu, buildMenu,
  startTraining: (id, h, e) => { G.selected = id; G.heroLvl = h; G.enemyLvl = e; G.count = 1; startTraining(); }
};

// хук для автотестов и отладки
window.__proto = {
  G, input, ui,
  get fight() { return fight; }, get run() { return run; },
  startFight: startTraining, startRun, startExplore, genDungeon, exGoTo,
  fightWith: (ids, h = 1, e = 1) => { run = null; newFight(ids, h, e); G.mode = 'fight'; G.paused = false; hideAllOverlays(); show(ui.pauseBtn); }, chooseDoor, chooseNode, genFloor, heroTap, resolveSwipe,
  press: (x, y) => onPress({ x, y }, 99), move: (x, y) => onMove({ x, y }, 99), release: () => onRelease(99),
  // начертить круг жестом (как пальцем): центр, радиус, доля оборота
  circle: (cx, cy, r, turns = 1.05) => {
    const n = Math.max(24, Math.round(r * turns / 3));
    onPress({ x: cx + r, y: cy }, 99);
    for (let i = 1; i <= n; i++) { const a = i / n * turns * Math.PI * 2; onMove({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }, 99); }
    onRelease(99);
  },
  bonusKinds: Object.keys(BONUS),
  captureChance: () => (fight ? captureChance(fight.enemy) : 0),
  guardCenter: () => guardCenter(),
  setAuto: (v) => { G.auto = !!v; },
  portraitSpot: (id) => { delete portraitCache[id]; return portraitSpot(id); },
  // ускорение: setSpeed(n) — n шагов логики за кадр; fastForward(сек) — сразу прокрутить игровое время
  // без отрисовки (останавливается, когда бой закончился и показаны итоги)
  setSpeed: (n) => { G.speed = clamp(Math.round(n) || 1, 1, 16); },
  fastForward: (sec, step = 1 / 60) => {
    let done = 0;
    for (; done < sec; done += step) {
      update(step);
      if (G.mode === 'fight' && fight && fight.resultShown) break;
    }
    return done;
  },
  next: afterRunFight
};
boot();
