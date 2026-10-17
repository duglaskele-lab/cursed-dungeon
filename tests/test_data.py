"""Целостность данных (js/data.js) и переводов (js/lang/*.js)."""
import re
from pathlib import Path

from conftest import ROOT

DATA_CHECK = r'''() => {
  const D = window.GAME_DATA, L = window.LANGS, errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  const num = (v) => typeof v === 'number' && isFinite(v);
  const bonusKinds = __proto.bonusKinds;
  const ids = Object.keys(D.enemies);
  for (const [id, e] of Object.entries(D.enemies)) {
    const w = (m) => `enemies.${id}: ${m}`;
    need(e.name && e.subtitle && e.about, w('нет name/subtitle/about'));
    need(['normal', 'elite', 'boss'].includes(e.kind), w('kind ' + e.kind));
    need(Array.isArray(e.sprites) && e.sprites.length >= 1, w('нет sprites'));
    need(Number.isInteger(e.armor) && e.armor >= 1, w('armor'));
    need(e.sprites.length <= e.armor + 1, w('спрайтов больше, чем armor + 1'));
    for (const k of ['hp', 'stamina', 'stamRegen', 'xp', 'chest']) need(num(e[k]), w(k));
    const a = e.attack || {};
    for (const k of ['dmg', 'telegraph', 'follow']) need(num(a[k]), w('attack.' + k));
    for (const k of ['interval', 'strikes']) need(Array.isArray(a[k]) && a[k].length === 2 && a[k][0] <= a[k][1], w('attack.' + k));
    const s = e.spheres || {};
    for (const k of ['every', 'count', 'grow']) need(Array.isArray(s[k]) && s[k][0] <= s[k][1], w('spheres.' + k));
    for (const el of s.elements || []) need(D.elements[el], w('нет стихии ' + el));
    need((s.elements || []).length > 0, w('нет spheres.elements'));
    const comp = e.companion || {};
    const slots = Object.keys(comp);
    need(slots.length >= 1, w('нет companion'));
    need(e.kind !== 'normal' || slots.length === 1, w('у обычной противницы должен быть один слот'));
    for (const [slot, b] of Object.entries(comp)) {
      need(D.squad.includes(slot), w('неизвестный слот ' + slot));
      need(bonusKinds.includes(b.bonus), w('неизвестный бонус ' + b.bonus));
      need(num(b.value) && b.value > 0, w('бонус без value'));
    }
    if (e.portrait) need(num(e.portrait.x) && num(e.portrait.y), w('portrait'));
    if (e.kind === 'boss' && e.phases) need(e.phases.length === e.armor + 1, w('фаз должно быть armor + 1'));
    const en = L.en.content.enemies[id];
    need(en && en.name && en.subtitle && en.about, w('нет перевода в en.js'));
    if (e.phases) need(en && en.phases && en.phases.length === e.phases.length, w('нет перевода фаз'));
    if (e.intro) need(en && en.intro, w('нет перевода intro'));
  }
  const F = D.floor;
  for (const [i, z] of F.zones.entries()) {
    need(z.pool.length > 0, `floor.zones[${i}]: пустой пул`);
    for (const id of z.pool) need(ids.includes(id), `floor.zones[${i}]: нет противницы ${id}`);
  }
  for (const id of [].concat(F.boss)) need(D.enemies[id] && D.enemies[id].kind === 'boss', 'floor.boss ' + id);
  for (const id of [].concat(F.elite)) need(D.enemies[id] && D.enemies[id].kind === 'elite', 'floor.elite ' + id);
  for (const sec of ['relics', 'upgrades']) {
    const seen = new Set();
    for (const r of D[sec]) {
      need(!seen.has(r.id), `${sec}: повтор id ${r.id}`); seen.add(r.id);
      need(r.name && r.text, `${sec}.${r.id}: нет name/text`);
      need(L.en.content[sec][r.id], `${sec}.${r.id}: нет перевода в en.js`);
    }
  }
  for (const id of Object.keys(D.elements)) need(L.en.content.elements[id], `elements.${id}: нет перевода`);
  return { errs, sprites: Object.values(D.enemies).flatMap((e) => e.sprites),
    ru: Object.keys(L.ru.ui), en: Object.keys(L.en.ui) };
}'''


def test_data_consistent(game):
    r = game.js(DATA_CHECK)
    assert r['errs'] == []
    for src in r['sprites']:
        assert (ROOT / src).is_file(), f'нет файла спрайта {src}'


def test_ui_keys_same_in_both_languages(game):
    r = game.js(DATA_CHECK)
    ru, en = set(r['ru']), set(r['en'])
    assert sorted(ru - en) == [], 'ключи есть только в ru.js'
    assert sorted(en - ru) == [], 'ключи есть только в en.js'


def test_used_keys_exist(game):
    """Каждый ключ t('...') в коде и data-i18n в HTML есть в словаре."""
    r = game.js(DATA_CHECK)
    known = set(r['ru'])
    used = set()
    for f in sorted((ROOT / 'js').rglob('*.js')):
        if 'lang' in f.parts:
            continue
        used |= set(re.findall(r"\bt\(\s*'([^'\n]+)'\s*[,)]", f.read_text(encoding='utf-8')))
    used |= set(re.findall(r'data-i18n(?:-html|-aria)?="([^"]+)"', (ROOT / 'index.html').read_text(encoding='utf-8')))
    assert sorted(used - known) == []


def test_english_menu(open_game):
    g = open_game('en')
    assert g.js('GAME_DATA.enemies.bunny.name') == 'Bunny Girl'
    assert g.js('document.title') != g.js('LANGS.ru.ui["doc.title"]')
