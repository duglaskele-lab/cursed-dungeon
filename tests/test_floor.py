"""Генератор этажа-графа: правила из CLAUDE.md на тысячах случайных этажей."""

CHECK = r'''(N) => {
  const errs = {}; const bad = (k) => { errs[k] = (errs[k] || 0) + 1; };
  const nLayers = GAME_DATA.floor.zones.reduce((s, z) => s + z.rooms, 0) + 1;
  const stats = { bands: {}, exits: {}, types: {}, startExits: {}, elitePaths: 0, paths: 0 };
  for (let it = 0; it < N; it++) {
    const f = __proto.genFloor();
    const all = [f.start, ...f.layers.flat()];
    if (f.layers.length !== nLayers) bad('layers!=11');
    if (f.layers[nLayers - 1].length !== 1 || f.layers[nLayers - 1][0].type !== 'boss') bad('boss');
    stats.startExits[f.start.next.length] = (stats.startExits[f.start.next.length] || 0) + 1;
    for (const L of f.layers.slice(0, nLayers - 1)) stats.bands[L.length] = (stats.bands[L.length] || 0) + 1;
    for (const n of all) {
      if (n.type !== 'boss') {
        if (n.next.length < 1 || n.next.length > 3) bad('exits');
        stats.exits[n.next.length] = (stats.exits[n.next.length] || 0) + 1;
        for (const m of n.next) {
          if (m.li !== n.li + 1) bad('not forward');
          const d = n.doors.get(m);
          if (!d) { bad('no door'); continue; }
          if (d.v0 < Math.max(n.rect.v0, m.rect.v0) - 1e-9 || d.v1 > Math.min(n.rect.v1, m.rect.v1) + 1e-9 || d.v1 - d.v0 < 0.8) bad('door off wall');
          if (Math.abs(d.ua - n.rect.u1) > 1e-9 || Math.abs(d.ub - m.rect.u0) > 1e-9 || d.ub <= d.ua) bad('door gap');
        }
      }
      if (n.type !== 'start' && !all.some((p) => p.next.includes(n))) bad('unreachable');
      stats.types[n.type] = (stats.types[n.type] || 0) + 1;
      if ((n.type === 'fight' || n.type === 'elite' || n.type === 'boss') && (!n.enemy || !n.lvl)) bad('no enemy');
      for (const m of n.next) if (['rest', 'elite', 'treasure'].includes(n.type) && n.type === m.type) bad('repeat ' + n.type);
    }
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
      const p = all[a].rect, q = all[b].rect;
      if (p.u0 < q.u1 && q.u0 < p.u1 && p.v0 < q.v1 && q.v0 < p.v1) bad('rooms overlap');
    }
    // фиксированные комнаты: номер комнаты на пути (1 — старт) → тип
    for (const [room, type] of Object.entries(GAME_DATA.floor.fixed)) if (f.layers[room - 2].some((n) => n.type !== type)) bad('fixed ' + room);
    if (!all.some((n) => n.type === 'elite')) bad('no elite');
    // все пути: длина и элита на пути
    const walk = (n, depth, elite) => {
      if (n.type === 'boss') { stats.paths++; if (elite) stats.elitePaths++; if (depth !== nLayers + 1) bad('path len ' + depth); return; }
      for (const m of n.next) walk(m, depth + 1, elite || m.type === 'elite');
    };
    walk(f.start, 1, false);
    // плоскость: двери соседних поясов не пересекаются
    for (const L of [[f.start], ...f.layers]) {
      const es = L.flatMap((a) => a.next.map((b) => [a.i, b.i]));
      for (const [a1, b1] of es) for (const [a2, b2] of es) if (a1 < a2 && b1 > b2) bad('crossing');
    }
  }
  return { errs, stats };
}'''


def test_floor_rules(game):
    r = game.js(CHECK, 2000)
    assert r['errs'] == {}
    st = r['stats']
    # ветвление: заметная доля комнат с 2–3 выходами, и у старта их больше одного
    multi = st['exits'].get('2', 0) + st['exits'].get('3', 0)
    assert multi / sum(st['exits'].values()) > 0.2
    assert st['startExits'].get('1', 0) == 0
