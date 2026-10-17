"""Забег целиком: бот проходит этаж-граф и режим исследования до босса.

Бой выигрывается подсказкой (здоровье противницы = 1, брони нет), время прокручивается fastForward,
в панелях выбирается первый доступный вариант.
"""
import pytest

BOT = r'''([mode, maxSteps]) => {
  const P = __proto, $ = (s) => document.querySelector(s), vis = (s) => !$(s).classList.contains('hidden');
  const log = { rooms: [], fights: 0, panels: 0, steps: 0, threat: 0 };
  const exNext = () => {         // исследование: ближайшая цель — объект или край тумана
    const ex = P.run.ex, m = ex.m, from = ex.hy * m.w + ex.hx, N = m.w * m.h;
    const ok = (i) => m.tiles[i] && ex.seen[i];
    const nb = (i) => { const x = i % m.w; return [x > 0 ? i - 1 : -1, x < m.w - 1 ? i + 1 : -1, i - m.w, i + m.w].filter((j) => j >= 0 && j < N); };
    const dist = new Int32Array(N).fill(-1), q = [from]; dist[from] = 0;
    for (let h = 0; h < q.length; h++) for (const j of nb(q[h])) if (dist[j] < 0 && ok(j)) { dist[j] = dist[q[h]] + 1; q.push(j); }
    let best = null;
    const consider = (i, prio) => { if (dist[i] > 0 && (!best || dist[i] + prio < best.d)) best = { i, d: dist[i] + prio }; };
    for (const o of ex.objs) if (!o.done && o.type !== 'boss') consider(o.y * m.w + o.x, 0);
    for (let i = 0; i < N; i++) if (ok(i) && nb(i).some((j) => m.tiles[j] && !ex.seen[j])) consider(i, 4);
    if (!best) { const b = ex.objs.find((o) => o.type === 'boss'); if (b && dist[b.y * m.w + b.x] > 0) best = { i: b.y * m.w + b.x }; }
    return best && P.exGoTo(best.i % m.w, (best.i / m.w) | 0);
  };
  if (mode === 'map') P.startRun(); else P.startExplore();
  for (; log.steps < maxSteps; log.steps++) {
    const r = P.run;
    if (!r) return { ...log, end: 'menu' };
    if (vis('#result')) { $('#nextBtn').click(); continue; }
    if (vis('#panel')) {
      const b = $('#pChoices button:not([disabled])');
      if (!b) return { ...log, end: 'panel without buttons' };
      log.panels++; log.last = $('#pKicker').textContent; b.click(); continue;
    }
    if (P.G.mode === 'fight' && P.fight && !P.fight.over) {
      log.fights++;
      const f = P.fight; f.hero.hp = f.hero.hpMax; f.spheres = []; f.enemy.stage = f.enemy.parts; f.enemy.hp = 1; f.hero.chargeT = 0; f.hero.shock = 0;
      P.heroTap(270, 500); P.fastForward(10); continue;
    }
    if (P.G.mode === 'map' && r.cur.done && !r.trans) {
      const n = r.cur.next[Math.floor(Math.random() * r.cur.next.length)];
      log.rooms.push(n.type); P.chooseNode(n); P.fastForward(3); continue;
    }
    if (P.G.mode === 'explore' && r.cur.done && !r.ex.path.length && !r.ex.ambush) {
      log.threat = Math.max(log.threat, r.ex.threat);
      r.hero.hp = Math.max(r.hero.hp, r.hero.hpMax * 0.5);
      if (!exNext()) return { ...log, end: 'stuck' };
    }
    P.fastForward(0.5);
  }
  return { ...log, end: 'too long' };
}'''


@pytest.mark.parametrize('lang', ['ru', 'en'])
def test_full_floor_run(open_game, lang):
    g = open_game(lang)
    n_rooms = g.js('GAME_DATA.floor.zones.reduce((s, z) => s + z.rooms, 0) + 1')
    for _ in range(2):
        r = g.js(BOT, ['map', 3000])
        assert r['end'] == 'menu' and r['last'] == g.js("I18N.t('win.kicker')"), r
        assert len(r['rooms']) == n_rooms and r['rooms'][-1] == 'boss', r
        assert 'rest' in r['rooms']


@pytest.mark.parametrize('lang', ['ru', 'en'])
def test_full_explore_run(open_game, lang):
    g = open_game(lang)
    r = g.js(BOT, ['explore', 20000])
    assert r['end'] == 'menu' and r['last'] == g.js("I18N.t('win.kicker')"), r
    assert r['fights'] >= 2 and r['threat'] > 0, r     # элита и босс есть всегда


def test_dungeon_generator(game):
    r = game.js('''() => { const errs = {}, bad = (k) => { errs[k] = (errs[k] || 0) + 1; };
      for (let it = 0; it < 300; it++) {
        __proto.startExplore(); const ex = __proto.run.ex, m = ex.m;
        if (m.rooms.some((r) => r.dist < 0)) bad('unreachable room');
        for (let i = 0; i < m.w * m.h; i++) if (m.tiles[i] && m.dist[i] < 0) bad('unreachable tile');
        if (ex.objs.filter((o) => o.type === 'monument').length !== GAME_DATA.explore.monuments.length) bad('monuments');
        if (!ex.objs.some((o) => o.type === 'boss')) bad('no boss');
        if (!ex.objs.some((o) => o.type === 'elite')) bad('no elite');
        for (const o of ex.objs) if (['fight', 'elite', 'boss'].includes(o.type) && (!o.enemy || !o.lvl)) bad('no enemy');
      }
      return errs; }''')
    assert r == {}
