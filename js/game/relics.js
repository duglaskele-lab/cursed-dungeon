// Реликвии и улучшения героя: что они делают. Числа и тексты — в data.js (relics, upgrades).
'use strict';

// ---------------------------------------------------------------- простые эффекты (без кода)
// Поля записи в data.js: bonus + value (виды BONUS, как у спутниц), hpMax, seals. Действуют один раз —
// при получении в забеге, и меняют героя забега rh (его mods, здоровье, печати).
function grantPerk(rh, p) {
  if (p.bonus) BONUS[p.bonus](rh.mods, p.value);
  if (p.hpMax) { rh.hpMax += p.hpMax; rh.hp = Math.min(rh.hpMax, rh.hp + p.hpMax); }
  if (p.seals) { rh.seals += p.seals; rh.sealsMax += p.seals; }
}

// ---------------------------------------------------------------- хуки реликвий в бою
// RELICS[id] — особые эффекты, r — запись реликвии из data.js (там её числа). Два вида хуков:
//   событие:     name(h, ctx, r)          — relicEvent(h, name, ctx);
//   модификатор: name(value, h, ctx, r)   — relicMod(h, name, value, ctx) возвращает новое значение.
// События боя: parry {} — удачное парирование; chargedHit { enemy } — заряженный удар;
//   sphereLink { enemy, n } — связка из n сфер. Модификаторы: critMul — множитель удара по слабой точке.
// Новый хук = вызов relicEvent/relicMod в коде боя + строка в этом комментарии.
const RELICS = {
  fang: { parry: (h) => { h.chargeT = CHARGE_FULL; } },
  moon: { sphereLink: (h, c, r) => { if (c.n >= r.links) tryBreak(c.enemy); } },
  ember: { chargedHit: (h, c, r) => { c.enemy.burn = r.dur; c.enemy.burnDps = c.enemy.hpMax * r.burn / r.dur; } },
  claw: { critMul: (v, h, c, r) => Math.max(v, r.crit) }
};
const relicDef = (id) => D.relics.find((r) => r.id === id);
const relicIcon = (id) => { const r = relicDef(id); return (r && r.icon) || `assets/relics/${id}.svg`; };

function relicEvent(h, name, ctx = {}) {
  for (const id of h.relics) { const fn = RELICS[id] && RELICS[id][name]; if (fn) fn(h, ctx, relicDef(id)); }
}
function relicMod(h, name, value, ctx = {}) {
  for (const id of h.relics) { const fn = RELICS[id] && RELICS[id][name]; if (fn) value = fn(value, h, ctx, relicDef(id)); }
  return value;
}
