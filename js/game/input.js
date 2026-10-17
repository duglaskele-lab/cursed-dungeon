// Ввод: onPress/onMove/onRelease (Pointer Events) → бой, план этажа, исследование.
'use strict';

// ---------------------------------------------------------------- ввод
function toLogical(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
}
function onPress(p, id) {
  if (G.paused) return false;
  if (G.mode === 'map') { mapPointer(p); return false; }
  if (G.mode === 'explore') { if (run) explorePointer(p); return false; }
  if (G.mode !== 'fight' || !fight || input.down) return false;
  // касание портрета спутницы показывает её бонус и не считается ударом
  const si = D.squad.findIndex((s, k) => squadMember(s) && inRect(squadSlotRect(k), p));
  if (si >= 0) { G.slotTip = { i: si, until: G.time + 2.5 }; return false; }
  if (G.auto) return false;      // при автобое касания не мешают компьютеру
  input.down = true; input.id = id;
  input.x = input.sx = p.x; input.y = input.sy = p.y;
  input.downT = fight.t; input.downReal = performance.now();
  input.path = [{ x: p.x, y: p.y }];
  input.swiping = false; input.guardPress = false;
  // нажатие в круг удара во время замаха — защита, а не удар
  if (!fight.over && fight.enemy.state === 'telegraph' && inGuardCircle(p)) { input.guardPress = true; guardPress(); }
  return true;
}
function onMove(p, id) {
  G.hover = p;
  BG.tx = clamp((p.x / W - 0.5) * 2, -1, 1);
  BG.ty = clamp((p.y / H - 0.5) * 2, -1, 1);
  if (!input.down || id !== input.id) return;
  input.x = p.x; input.y = p.y;
  const last = input.path[input.path.length - 1];
  if (dist(p.x, p.y, last.x, last.y) > 4) input.path.push({ x: p.x, y: p.y });
  if (!input.swiping && dist(p.x, p.y, input.sx, input.sy) > SWIPE_DIST) input.swiping = true;
}
function onRelease(id) {
  if (!input.down || id !== input.id) return;
  const dur = (performance.now() - input.downReal) / 1000;
  const path = input.path;
  const swiping = input.swiping, guarded = input.guardPress;
  input.down = false; input.id = null; input.swiping = false; input.guardPress = false;
  if (!fight || G.paused) return;
  if (swiping) resolveSwipe(path);          // росчерк по кругу удара урона не наносит (см. resolveSwipe)
  else if (!guarded && dur < TAP_MAX) heroTap(input.sx, input.sy);
}
canvas.addEventListener('pointerdown', (ev) => {
  sfx.ensure();
  if (onPress(toLogical(ev), ev.pointerId)) {
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
});
canvas.addEventListener('pointermove', (ev) => onMove(toLogical(ev), ev.pointerId));
canvas.addEventListener('pointerup', (ev) => onRelease(ev.pointerId));
canvas.addEventListener('pointercancel', (ev) => onRelease(ev.pointerId));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
