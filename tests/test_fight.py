"""Механики боя: урон без брони, захват кругом, исходы, автобой и групповой бой."""
import pytest

SETUP = '''(id) => {
  __proto.fightWith([id || 'miko'], 1, 1);
  const f = __proto.fight, e = f.enemy;
  e.nextAttack = 999; e.nextSpheres = 999; e.nextWeak = 999;
  return { parts: e.parts, hp: e.hp };
}'''
TAP = '''() => { const f = __proto.fight, e = f.enemy; f.hero.chargeT = 0; f.hero.stam = 100; f.hero.exhausted = false;
  const h0 = e.hp; __proto.heroTap(270, 500); return h0 - e.hp; }'''
CIRCLE = '(() => { const L = __proto.fight.layout; __proto.circle(L.cx, L.chestY + 40, 90); })()'


def test_double_damage_without_armor(game):
    game.js(SETUP)
    armored = game.js(TAP)
    game.js('() => { const e = __proto.fight.enemy; e.stage = e.parts; }')
    broken = game.js(TAP)
    assert armored > 0
    assert broken == pytest.approx(armored * game.js('GAME_DATA.broken.dmgMul'), rel=0.25)


def test_zero_stamina_does_not_end_fight_without_armor(game):
    game.js(SETUP)
    r = game.js('''() => { const f = __proto.fight, e = f.enemy; e.stage = e.parts; e.stam = 0;
      for (let i = 0; i < 3; i++) { f.hero.chargeT = 2; f.hero.stam = 100; __proto.heroTap(270, 500); }
      return { over: f.over, hp: e.hp }; }''')
    assert not r['over'] and r['hp'] > 0


def test_capture_fails_at_full_stamina(game):
    game.js(SETUP)
    r = game.js('''() => { const f = __proto.fight, e = f.enemy; e.stage = e.parts; e.stam = e.stamMax; e.regenStop = 1e9;
      const h0 = e.hp, s0 = f.hero.seals, ch = __proto.captureChance(); f.hero.stam = 100;
      const L = f.layout; __proto.circle(L.cx, L.chestY + 40, 90);
      return { chance: ch, dmg: h0 - e.hp, seals: f.hero.seals, seals0: s0, over: f.over, tries: f.stats.captureTries }; }''')
    assert r['chance'] == 0
    assert r['tries'] == 1 and not r['over']
    assert r['dmg'] > 0, 'неудачный захват наносит урон росчерка'
    assert r['seals'] == r['seals0'], 'печать тратится только при успехе'


def test_not_a_circle(game):
    game.js(SETUP)
    r = game.js('''() => { const f = __proto.fight, L = f.layout; f.enemy.stage = f.enemy.parts;
      __proto.circle(L.cx, L.chestY, 25);                       // слишком маленький
      __proto.press(L.cx - 150, L.chestY); for (let i = 1; i <= 20; i++) __proto.move(L.cx - 150 + i * 15, L.chestY + i * 3); __proto.release();
      __proto.circle(70, 300, 60);                              // мимо противницы
      return f.stats.captureTries; }''')
    assert r == 0


@pytest.mark.parametrize('frac, expected', [(0, 0.7), (0.5, 0.35)])
def test_capture_rate(game, frac, expected):
    n, ok = 300, 0
    ok = game.js('''([n, frac]) => { let ok = 0;
      for (let i = 0; i < n; i++) {
        __proto.fightWith(['miko'], 1, 1);
        const f = __proto.fight, e = f.enemy, L = f.layout;
        e.nextAttack = 999; e.stage = e.parts; e.stam = e.stamMax * frac; e.regenStop = 1e9;
        __proto.circle(L.cx, L.chestY + 40, 90);
        if (f.outcome === 'captured') ok++;
      }
      return ok; }''', [n, frac])
    assert abs(ok / n - expected) < 0.1


def test_outcomes_by_health(game):
    game.js(SETUP)
    defeated = game.js('''() => { const f = __proto.fight, e = f.enemy; e.stage = e.parts; e.hp = 1; f.hero.chargeT = 0; __proto.heroTap(270, 500); return f.outcome; }''')
    game.js(SETUP)
    escaped = game.js('''() => { const f = __proto.fight, e = f.enemy; e.hp = 1; __proto.heroTap(270, 500); return f.outcome; }''')
    assert (defeated, escaped) == ('defeated', 'escaped')


def test_no_seals_circle_is_slash(game):
    game.js(SETUP)
    r = game.js('''() => { const f = __proto.fight, e = f.enemy, L = f.layout; e.stage = e.parts; e.stam = 0; f.hero.seals = 0; const h0 = e.hp;
      __proto.circle(L.cx, L.chestY + 40, 90); return { over: f.over, dmg: h0 - e.hp }; }''')
    assert not r['over'] and r['dmg'] > 0


AUTO = '''([ids, h, e, n]) => { const P = __proto, out = [];
  for (let k = 0; k < n; k++) {
    P.fightWith(ids, h, e); P.setAuto(true); P.fastForward(900);
    const f = P.fight;
    out.push({ over: f.over, outcome: f.outcome, t: f.endT, parries: f.stats.parries || 0, tries: f.stats.captureTries || 0,
      results: (f.results || []).map((r) => r.outcome) });
  }
  P.setAuto(false); return out; }'''


@pytest.mark.parametrize('enemy', ['bunny', 'miko', 'moth'])
def test_auto_battle_equal_level(game, enemy):
    """Автобой против рядовой равного уровня: побеждает, укладывается в цель 25–60 с (с запасом), не парирует и не ловит."""
    rs = game.js(AUTO, [[enemy], 1, 1, 5])
    for r in rs:
        assert r['over'] and r['outcome'] in ('defeated', 'escaped'), r
        assert 20 <= r['t'] <= 90, r
        assert r['parries'] == 0 and r['tries'] == 0


@pytest.mark.parametrize('ids, lvl', [(['wolf'], 3), (['nekomata'], 4)])
def test_auto_battle_elite_and_boss_finish(game, ids, lvl):
    for r in game.js(AUTO, [ids, lvl, lvl, 2]):
        assert r['over'], r


def test_group_fight_finishes(game):
    for r in game.js(AUTO, [['miko', 'bunny', 'moth'], 3, 2, 3]):
        assert r['over']
        assert r['outcome'] == 'lose' or len(r['results']) == 3


def test_group_back_slash_and_next_front(game):
    game.js("__proto.fightWith(['miko', 'bunny', 'wolf'], 2, 2)")
    r = game.js('''() => { const f = __proto.fight; f.spheres = [];
      const back = f.foes.find((x) => x.slot !== 'front'), L = back.target, h0 = back.enemy.hp;
      f.hero.stam = 100; f.hero.exhausted = false;
      __proto.press(L.cx - 60, L.chestY - 40); for (let i = 1; i <= 10; i++) __proto.move(L.cx - 60 + i * 12, L.chestY - 40 + i * 10); __proto.release();
      return { slots: f.foes.map((x) => x.slot).sort(), dmg: h0 - back.enemy.hp, front: f.front.id }; }''')
    assert r['slots'] == ['front', 'left', 'right']
    assert r['dmg'] > 0
    first = r['front']
    game.js('''() => { const f = __proto.fight; f.spheres = []; f.enemy.stage = f.enemy.parts; f.enemy.hp = 1; f.hero.chargeT = 0; f.hero.shock = 0; __proto.heroTap(270, 500); }''')
    game.js('__proto.fastForward(3)')
    r = game.js('() => ({ front: __proto.fight.front.id, results: __proto.fight.results.map((x) => x.id + ":" + x.outcome) })')
    assert r['results'] == [first + ':defeated']
    assert r['front'] != first
