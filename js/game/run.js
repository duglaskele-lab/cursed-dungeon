// Забег: комнаты enterNode, награды после боя, привал, события EVENTS, конец забега.
'use strict';

function enterNode(node) {
  node.visited = true;
  run.cur = node;
  run.path.push(node);
  G.bigMap = false;
  const rh = run.hero;
  switch (node.type) {
    case 'fight':
    case 'elite':
      startRunFight(node);
      break;
    case 'boss': {
      const ed = D.enemies[node.enemy];
      showPanel({
        kicker: t('boss.kicker'), title: ed.name, img: ed.sprites[0], text: ed.intro,
        choices: [{ title: t('boss.fight'), desc: ed.about, on: () => { hidePanel(); startRunFight(node); } }]
      });
      break;
    }
    case 'rest':
      showRest();
      break;
    case 'treasure': {
      const opts = relicChoices(3);
      if (!opts.length) { grantXp(40); showPanel({ kicker: t('tr.kicker'), title: t('tr.emptyTitle'), text: t('tr.emptyText'), choices: [{ title: t('next'), on: roomDone }] }); break; }
      showPanel({
        kicker: t('tr.kicker'), title: t('tr.title'), text: t('tr.text'),
        choices: opts.map((r) => ({ title: r.name, desc: r.text, cls: 'relic', ck: t('ck.relic'), on: () => { addRelic(r.id); roomDone(); } }))
      });
      break;
    }
    case 'event':
      showEvent();
      break;
  }
}

function roomDone() {
  run.cur.done = true;
  hidePanel();
  G.mode = runScreen();
  fight = null;
  show(ui.pauseBtn);
}

function startRunFight(node) {
  newFight(node.enemies || node.enemy, run.hero.lvl, node.lvl, { runHero: run.hero });
  G.mode = 'fight'; G.paused = false;
  hideAllOverlays(); show(ui.pauseBtn);
}

function afterRunFight() {
  const f = fight, rh = run.hero, node = run.cur;
  rh.hp = clamp(Math.round(f.hero.hp), 0, rh.hp);      // запас здоровья от отряда после боя сгорает
  rh.seals = f.hero.seals;
  run.fights++;
  run.time += f.endT;
  if (f.outcome === 'lose') { runOver(); return; }
  const res = f.results, group = f.foes.length > 1;
  res.forEach((r) => { if (r.outcome === 'captured') run.captured.push(r.id); });
  if (node.type === 'boss') { runComplete(); return; }
  const hpBefore = rh.hp;
  heal(D.hero.postFightHeal || 0);                     // передышка после боя
  const healed = Math.round(rh.hp - hpBefore);
  const xpMul = (o) => (o === 'captured' ? 0.8 : o === 'escaped' ? 0.5 : 1);
  const xp = Math.round(res.reduce((sum, r) => sum + r.ed.xp * xpMul(r.outcome), 0));
  const lv = grantXp(xp);
  const lines = [t('reward.xp', { n: xp })];
  if (healed > 0) lines.push(t('reward.healed', { n: healed }));
  if (group) res.forEach((r) => lines.push(t('reward.groupLine', { name: r.ed.name, out: t('out.' + r.outcome) })));
  for (const r of res) {
    if (r.outcome !== 'captured') continue;
    lines.push(t('reward.caught', { name: r.ed.name }));
    if (companionSlots(r.id).length) lines.push(t('reward.joins', { list: companionLine(r.id) }));
  }
  if (lv) lines.push(t('reward.lvl', { n: rh.lvl }));
  lines.push('', t('reward.pick'));
  const choices = [];
  const rel = relicChoices(1)[0];
  if (rel) choices.push({ title: rel.name, desc: rel.text, cls: 'relic', ck: t('ck.relic'), on: () => { addRelic(rel.id); roomDone(); } });
  const up = pick(D.upgrades);
  choices.push({ title: up.name, desc: up.text, ck: t('ck.upgrade'), on: () => { applyUpgrade(up.id); roomDone(); } });
  if (rh.seals < 4) choices.push({ title: t('reward.seal'), desc: t('reward.sealDesc', { n: rh.seals }), ck: t('ck.seal'), on: () => { rh.seals++; rh.sealsMax = Math.max(rh.sealsMax, rh.seals); roomDone(); } });
  else choices.push({ title: t('reward.bandage'), desc: t('reward.bandageDesc'), ck: t('ck.heal'), on: () => { heal(0.3); roomDone(); } });
  G.mode = runScreen();
  hide(ui.result);
  if (lv) sfx.level();
  showPanel({ kicker: node.type === 'elite' ? t('reward.eliteKicker') : t('reward.kicker'), title: group ? t('res.group') : resultTitle(f.outcome), img: spriteFor(res[0].ed, res[0].stage), text: lines.join('\n'), choices });
}

function resultTitle(o) { return ['captured', 'defeated', 'escaped', 'lose'].includes(o) ? t('res.' + o) : ''; }

function grantXp(x) {
  const rh = run.hero;
  rh.xp += x;
  let gained = 0;
  while (rh.xp >= xpNeed(rh.lvl)) {
    rh.xp -= xpNeed(rh.lvl);
    rh.lvl++;
    gained++;
    rh.hpMax += D.hero.hpPerLvl;
    rh.hp = Math.min(rh.hpMax, rh.hp + D.hero.hpPerLvl + Math.round(rh.hpMax * 0.2));
  }
  return gained;
}
function heal(frac) { const rh = run.hero; rh.hp = Math.min(rh.hpMax, Math.round(rh.hp + rh.hpMax * frac)); }

function relicChoices(n) { return shuffle(D.relics.filter((r) => !run.hero.relics.includes(r.id))).slice(0, n); }
function addRelic(id) {
  const rh = run.hero;
  rh.relics.push(id);
  if (id === 'seal') { rh.seals++; rh.sealsMax++; }
  if (id === 'heart') { rh.hpMax += 25; rh.hp += 25; }
  if (id === 'belt') rh.mods.tapCostMul *= 0.7;
}
function applyUpgrade(id) {
  const rh = run.hero, m = rh.mods;
  rh.upgrades.push(id);
  if (id === 'dmg') m.dmgMul *= 1.12;
  if (id === 'charge') m.chargeSpeed *= 1.2;
  if (id === 'parry') m.parryBonus += 0.08;
  if (id === 'stam') m.stamAdd += 20;
  if (id === 'regen') m.regenMul *= 1.25;
  if (id === 'hp') { rh.hpMax += 15; rh.hp = Math.min(rh.hpMax, rh.hp + 15); }
}

function showRest() {
  const rh = run.hero;
  const caught = Object.keys(save.captured).length;
  showPanel({
    kicker: t('rest.kicker'), title: t('rest.title'),
    text: t('rest.text', { hp: Math.ceil(rh.hp), max: rh.hpMax }),
    choices: [
      { title: t('rest.rest'), desc: t('rest.restDesc'), on: () => { heal(0.35); roomDone(); } },
      { title: t('rest.train'), desc: t('rest.trainDesc'), on: () => showUpgradePick(t('up.trainTitle'), t('up.trainText')) },
      { title: t('rest.squad'), desc: squadSummary(), on: () => showSquadPanel(showRest) },
      { title: t('rest.talk'), desc: caught ? t('rest.talkSoon') : t('rest.talkNone'), disabled: true }
    ]
  });
}

function showUpgradePick(title, text) {
  const ups = shuffle(D.upgrades).slice(0, 3);
  showPanel({ kicker: t('up.kicker'), title, text, choices: ups.map((u) => ({ title: u.name, desc: u.text, ck: t('ck.upgrade'), on: () => { applyUpgrade(u.id); roomDone(); } })) });
}

const EVENTS = [
  {
    id: 'camp', title: t('ev.camp.title'),
    text: t('ev.camp.text'),
    choices: [
      { title: t('ev.camp.search'), desc: t('ev.camp.searchDesc'), act: () => {
        if (Math.random() < 0.65) { run.hero.seals++; run.hero.sealsMax = Math.max(run.hero.sealsMax, run.hero.seals); return t('ev.camp.searchOk'); }
        run.hero.hp = Math.max(1, run.hero.hp - 12); return t('ev.camp.searchBad');
      } },
      { title: t('ev.camp.sit'), desc: t('ev.camp.sitDesc'), act: () => { heal(0.2); return t('ev.camp.sitOut'); } }
    ]
  },
  {
    id: 'cage', title: t('ev.cage.title'), img: 'bunny',
    text: t('ev.cage.text'),
    choices: [
      { title: t('ev.cage.open'), desc: t('ev.cage.openDesc'), act: () => {
        const r = relicChoices(1)[0];
        if (!r) { grantXp(40); return t('ev.cage.openNone'); }
        addRelic(r.id); return t('ev.cage.openOk', { name: r.name, text: r.text });
      } },
      { title: t('ev.cage.pass'), desc: t('ev.cage.passDesc'), act: () => t('ev.cage.passOut') }
    ]
  },
  {
    id: 'altar', title: t('ev.altar.title'),
    text: t('ev.altar.text'),
    choices: [
      { title: t('ev.altar.touch'), desc: t('ev.altar.touchDesc'), act: () => {
        run.hero.hp = Math.max(1, Math.round(run.hero.hp - run.hero.hpMax * 0.2));
        const lv = grantXp(100);
        if (lv) sfx.level();
        return t('ev.altar.touchOut') + (lv ? t('ev.altar.lvl', { n: run.hero.lvl }) : '');
      } },
      { title: t('ev.altar.leave'), desc: t('ev.altar.leaveDesc'), act: () => t('ev.altar.leaveOut') }
    ]
  },
  {
    id: 'whisper', title: t('ev.whisper.title'),
    text: t('ev.whisper.text'),
    choices: [
      { title: t('ev.whisper.bold'), desc: t('ev.whisper.boldDesc'), act: () => {
        const u = pick(D.upgrades); applyUpgrade(u.id);
        return t('ev.whisper.boldOut', { name: u.name, text: u.text });
      } },
      { title: t('ev.whisper.quiet'), desc: t('ev.whisper.quietDesc'), act: () => { heal(0.1); return t('ev.whisper.quietOut'); } }
    ]
  }
];

function showEvent() {
  const id = run.events.shift() || pick(EVENTS).id;
  const ev = EVENTS.find((e) => e.id === id);
  showPanel({
    kicker: t('ev.kicker'), title: ev.title, text: ev.text, img: ev.img ? D.enemies[ev.img].sprites[0] : null,
    choices: ev.choices.map((c) => ({ title: c.title, desc: c.desc, on: () => {
      const out = c.act();
      showPanel({ kicker: t('ev.kicker'), title: ev.title, text: out, img: ev.img ? D.enemies[ev.img].sprites[0] : null, choices: [{ title: t('next'), on: roomDone }] });
    } }))
  });
}

function runSummaryText() {
  const rh = run.hero;
  const names = run.captured.map((id) => D.enemies[id].name);
  return [
    t('sum.time', { t: fmtTime(run.time), n: run.fights }),
    t('sum.lvl', { n: rh.lvl }),
    t('sum.caught', { list: names.length ? names.join(', ') : t('sum.nobody') }),
    t('sum.relics', { list: rh.relics.length ? rh.relics.map((id) => D.relics.find((r) => r.id === id).name).join(', ') : t('sum.none') })
  ].join('\n');
}

function finishRun(won) {
  save.runs.unshift({ won, lvl: run.hero.lvl, t: Math.round(run.time), caught: run.captured.length, at: Date.now() });
  save.runs = save.runs.slice(0, 5);
  writeSave();
}

function runComplete() {
  finishRun(true);
  G.mode = runScreen();
  hide(ui.result); hide(ui.pauseBtn);
  sfx.level();
  showPanel({
    kicker: t('win.kicker'), title: t(fight.outcome === 'captured' ? 'win.captured' : fight.outcome === 'escaped' ? 'win.escaped' : 'win.defeated', { name: fight.ed.name }), img: spriteFor(fight.ed, fight.enemy.stage),
    text: t('win.text') + '\n\n' + runSummaryText() + '\n\n' + t('win.end'),
    choices: [{ title: t('toMenu'), on: () => { run = null; toMenu(); } }]
  });
}

function runOver() {
  finishRun(false);
  G.mode = runScreen();
  hide(ui.result); hide(ui.pauseBtn);
  showPanel({
    kicker: t('lose.kicker'), title: t('lose.title'),
    text: t('lose.text') + '\n\n' + runSummaryText(),
    choices: [{ title: t('toMenu'), on: () => { run = null; toMenu(); } }]
  });
}
