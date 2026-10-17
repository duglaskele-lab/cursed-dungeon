"""Реликвии, улучшения и события: данные, хуки в бою и действия."""
import pytest

from conftest import ROOT

FIGHT = '''(relics) => {
  __proto.fightWith(['miko'], 1, 1);
  const f = __proto.fight, e = f.enemy;
  e.nextAttack = 999; e.nextSpheres = 999; e.nextWeak = 999;
  f.hero.relics = relics;
}'''
WEAK_TAP = '''() => { const f = __proto.fight, e = f.enemy, h = f.hero;
  f.weak = { x: 270, y: 450, t: 0 }; h.chargeT = 0; h.stam = 100; h.exhausted = false;
  const h0 = e.hp; __proto.heroTap(270, 450); return h0 - e.hp; }'''


def test_relic_definitions(game):
    r = game.js('''() => { const P = __proto, errs = [];
      for (const r of GAME_DATA.relics) {
        const simple = r.bonus || r.hpMax || r.seals;
        if (!simple && !P.relicHooks.includes(r.id)) errs.push(r.id + ': нет ни хука, ни простого эффекта');
        if (r.bonus && !P.bonusKinds.includes(r.bonus)) errs.push(r.id + ': неизвестный bonus ' + r.bonus);
      }
      for (const u of GAME_DATA.upgrades) {
        if (!u.bonus && !u.hpMax && !u.seals) errs.push(u.id + ': улучшение без эффекта');
        if (u.bonus && !P.bonusKinds.includes(u.bonus)) errs.push(u.id + ': неизвестный bonus ' + u.bonus);
      }
      return { errs, ids: GAME_DATA.relics.map((r) => r.icon || `assets/relics/${r.id}.svg`) }; }''')
    assert r['errs'] == []
    for icon in r['ids']:
        assert (ROOT / icon).is_file(), f'нет иконки {icon}'


def test_claw_triples_weak_point(game):
    game.js(FIGHT, [])
    base = game.js(WEAK_TAP)
    game.js(FIGHT, ['claw'])
    claw = game.js(WEAK_TAP)
    assert claw / base == pytest.approx(1.5, rel=0.2)


def test_ember_burns_on_charged_hit(game):
    game.js(FIGHT, ['ember'])
    burn = game.js('''() => { const f = __proto.fight, e = f.enemy; f.hero.chargeT = 2; f.hero.stam = 100; __proto.heroTap(270, 500); return e.burn; }''')
    assert burn == game.js("GAME_DATA.relics.find((r) => r.id === 'ember').dur")


@pytest.mark.parametrize('relics, full', [([], False), (['fang'], True)])
def test_fang_charges_after_parry(game, relics, full):
    game.js(FIGHT, relics)
    r = game.js('''() => { const P = __proto, f = P.fight, e = f.enemy, h = f.hero;
      e.state = 'telegraph'; e.atk = e.atk || { dmg: 10 };
      f.guardT = f.t - (GAME_DATA.hero.parryMin + GAME_DATA.hero.parryMax) / 2; f.guardPresses = [f.guardT]; h.chargeT = 0;
      const p0 = f.stats.parries; P.enemyImpact(); return { parried: f.stats.parries - p0, charge: h.chargeT }; }''')
    assert r['parried'] == 1
    assert (r['charge'] >= 2.0) == full


@pytest.mark.parametrize('relics, broken', [([], 0), (['moon'], 1)])
def test_moon_breaks_armor_on_link(game, relics, broken):
    game.js(FIGHT, relics)
    r = game.js('''() => { const P = __proto, f = P.fight, e = f.enemy;
      e.stam = 0; e.regenStop = 1e9; const s0 = e.stage;
      f.spheres = [150, 270, 390].map((x) => ({ x, y: 380, r: 30, r0: 14, r1: 40, t: 1, grow: 9, el: 'fire', taps: 0, hitFlash: 0, seed: 1 }));
      const path = []; for (let x = 100; x <= 440; x += 10) path.push({ x, y: 380 });
      P.resolveSwipe(path); return { links: f.stats.links, broke: e.stage - s0 }; }''')
    assert r['links'] == 1
    assert r['broke'] == broken


def test_simple_perks(game):
    """Пояс, сердце, печать, колокольчик и все улучшения: простые эффекты меняют героя забега."""
    r = game.js('''() => { const P = __proto; P.startRun(); const rh = P.run.hero, before = JSON.parse(JSON.stringify(rh));
      for (const id of ['belt', 'heart', 'seal', 'bell']) P.addRelic(id);
      for (const u of GAME_DATA.upgrades) P.applyUpgrade(u.id);
      return { before, after: JSON.parse(JSON.stringify(rh)) }; }''')
    b, a = r['before'], r['after']
    assert a['mods']['tapCostMul'] == pytest.approx(b['mods']['tapCostMul'] * 0.7)
    assert a['mods']['sphereSlow'] == pytest.approx(b['mods']['sphereSlow'] * 1.3)
    assert a['hpMax'] == b['hpMax'] + 25 + 15
    assert a['seals'] == b['seals'] + 1 and a['sealsMax'] == b['sealsMax'] + 1
    assert a['mods']['dmgMul'] == pytest.approx(b['mods']['dmgMul'] * 1.12)
    assert a['mods']['stamAdd'] == b['mods']['stamAdd'] + 20


def test_events_all_outcomes(game):
    """Каждый выбор каждого события: действия известны, тексты итога есть в словаре (ru и en)."""
    r = game.js('''() => { const P = __proto, errs = [], ru = LANGS.ru.ui, en = LANGS.en.ui;
      const need = (k) => { if (!(k in ru)) errs.push('ru: ' + k); if (!(k in en)) errs.push('en: ' + k); };
      need('ev.lvl');
      for (const ev of GAME_DATA.events) {
        if (ev.img && !GAME_DATA.enemies[ev.img]) errs.push(ev.id + ': нет противницы ' + ev.img);
        need(`ev.${ev.id}.title`); need(`ev.${ev.id}.text`);
        for (const c of ev.choices) {
          const k = `ev.${ev.id}.${c.id}`; need(k); need(k + 'Desc');
          const acts = c.chance !== undefined ? [c.ok, c.bad] : [c.do];
          if (c.chance !== undefined) { need(k + 'Ok'); need(k + 'Bad'); } else need(k + 'Out');
          for (const a of acts) for (const kind of Object.keys(a || {})) if (!P.eventFx.includes(kind)) errs.push(k + ': неизвестное действие ' + kind);
          if (acts.some((a) => a && a.relic)) need(k + 'None');
          for (let i = 0; i < 20; i++) {          // много раз: обе ветки шанса, реликвии кончаются
            P.startRun(); if (i >= 10) for (const rr of GAME_DATA.relics) P.addRelic(rr.id);
            const text = P.eventOutcome(ev, c);
            if (!text || /\\{\\w+\\}/.test(text) || text.startsWith('ev.')) errs.push(k + ': плохой текст «' + text + '»');
            if (!(P.run.hero.hp >= 1)) errs.push(k + ': здоровье ' + P.run.hero.hp);
          }
        }
      }
      return [...new Set(errs)]; }''')
    assert r == []
