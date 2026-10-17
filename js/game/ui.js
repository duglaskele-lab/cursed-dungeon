// Интерфейс: меню, панели, итоги боя, кнопки.
'use strict';

// ---------------------------------------------------------------- интерфейс
const ui = {
  loading: $('#loading'), menu: $('#menu'), result: $('#result'), pause: $('#pause'), pauseBtn: $('#pauseBtn'), panel: $('#panel'), autoBtn: $('#autoBtn')
};
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function hideAllOverlays() { [ui.menu, ui.result, ui.pause, ui.panel].forEach(hide); G.panelOpen = false; }

function showPanel(o) {
  $('#pKicker').textContent = o.kicker || '';
  $('#pTitle').textContent = o.title || '';
  $('#pText').textContent = o.text || '';
  const img = $('#pImg');
  if (o.img) { img.src = o.img; img.parentElement.classList.remove('hidden'); } else { img.removeAttribute('src'); img.parentElement.classList.add('hidden'); }
  const box = $('#pChoices');
  box.innerHTML = '';
  for (const c of o.choices || []) {
    const b = document.createElement('button');
    b.className = 'choice' + (c.cls ? ' ' + c.cls : '') + (c.icon ? ' has-ico' : '');
    if (c.disabled) b.disabled = true;
    b.innerHTML = `${c.icon ? '<img class="ico" alt="">' : ''}${c.ck ? `<i class="ck">${c.ck}</i>` : ''}<b></b>${c.desc ? '<span></span>' : ''}`;
    if (c.icon) b.querySelector('.ico').src = c.icon;
    b.querySelector('b').textContent = c.title;
    if (c.desc) b.querySelector('span').textContent = c.desc;
    b.addEventListener('click', () => { if (!c.disabled && c.on) { sfx.ensure(); c.on(); } });
    box.appendChild(b);
  }
  show(ui.panel);
  hide(ui.pauseBtn);
  G.panelOpen = true;
  ui.panel.scrollTop = 0;
}
function hidePanel() { hide(ui.panel); G.panelOpen = false; if (run) show(ui.pauseBtn); }

// Список реликвий забега в паузе: иконка, название, что делает
function fillPauseRelics() {
  const box = $('#pauseRelics'), ids = run ? run.hero.relics : [];
  box.classList.toggle('hidden', !ids.length);
  box.innerHTML = ids.length ? `<h2>${t('pause.relics')}</h2>` : '';
  for (const id of ids) {
    const r = relicDef(id), row = document.createElement('div');
    row.className = 'relic-row';
    row.innerHTML = '<img class="ico" alt=""><div><b></b><span></span></div>';
    row.querySelector('img').src = relicIcon(id);
    row.querySelector('b').textContent = r.name;
    row.querySelector('span').textContent = r.text;
    box.appendChild(row);
  }
}

function buildMenu() {
  const cards = $('#cards');
  cards.innerHTML = '';
  for (const [id, e] of Object.entries(D.enemies)) {
    const b = document.createElement('button');
    b.className = 'card' + (G.selected === id ? ' sel' : '');
    const kind = e.kind === 'boss' ? t('kind.boss') : e.kind === 'elite' ? t('kind.elite') : '';
    b.innerHTML = `
      <div class="portrait"><img src="${e.sprites[0]}" alt=""></div>
      ${kind ? `<div class="badge kind">${kind}</div>` : ''}
      ${save.captured[id] ? `<div class="badge">${t('menu.caught')}</div>` : ''}
      <div class="info"><div class="name">${e.name}</div><div class="tag">${e.subtitle}${e.custom ? t('menu.custom') : ''}</div><div class="about">${e.about}</div>${companionSlots(id).length ? `<div class="tag">${t('squad.cardLine', { list: companionLine(id) })}</div>` : ''}</div>`;
    b.addEventListener('click', () => { G.selected = id; buildMenu(); });
    cards.appendChild(b);
  }
  const sq = $('#squad');
  sq.innerHTML = '';
  for (const slot of D.squad) {
    const id = squadMember(slot), e = id && D.enemies[id];
    const b = document.createElement('button');
    b.className = 'slot' + (id ? ' on' : '');
    if (e) b.title = `${e.name} · ${t('slot.' + slot)}: ${bonusText(slotBonus(id, slot))}`;
    b.innerHTML = `<div class="portrait">${e ? `<div class="face" style="${portraitStyle(id, 1.6)}"></div>` : '<span class="q">?</span>'}</div>
      <div class="sl">${t('slot.' + slot)}</div><div class="nm">${e ? e.name : t('squad.empty')}</div><div class="bn">${e ? cap(bonusText(slotBonus(id, slot))) : ''}</div>`;
    b.addEventListener('click', () => { sfx.ensure(); pickCompanion(slot, () => { hidePanel(); buildMenu(); }); });
    sq.appendChild(b);
  }
  $('#lvHero').textContent = G.heroLvl;
  $('#lvEnemy').textContent = G.enemyLvl;
  const d = G.heroLvl - G.enemyLvl;
  const boss = D.enemies[G.selected].kind === 'boss';
  if (boss) G.count = 1;            // босс сражается один
  $('#lvCount').textContent = G.count;
  $('#lvHint').textContent = G.count > 1 ? t('hint.group', { n: G.count })
    : boss ? t('hint.boss')
    : d === 0 ? t('hint.equal')
    : d > 0 ? t('hint.stronger', { n: d })
    : t('hint.weaker', { n: -d });
  const outName = (o) => (['captured', 'finished', 'defeated', 'escaped', 'lose', 'group'].includes(o) ? t('out.' + o) : o);
  const log = $('#log');
  log.innerHTML = save.fights.length ? '' : `<div><span>${t('log.empty')}</span></div>`;
  for (const r of save.fights) {
    const row = document.createElement('div');
    const who = (r.ids || [r.id]).map((id) => (D.enemies[id] ? D.enemies[id].name : id)).join(' + ');
    row.innerHTML = `<span>${who} · ${r.h} / ${r.e}${r.run ? t('log.run') : ''}</span><span>${fmtTime(r.t)} · ${outName(r.o)}</span>`;
    log.appendChild(row);
  }
  const col = $('#collection');
  const caught = Object.entries(save.captured);
  col.innerHTML = caught.length ? '' : `<div><span>${t('col.empty')}</span></div>`;
  for (const [id, c] of caught) {
    if (!D.enemies[id]) continue;
    const row = document.createElement('div');
    const slots = companionSlots(id).map((s) => t('slot.' + s).toLowerCase()).join(', ');
    row.innerHTML = `<span>${D.enemies[id].name}${slots ? ` · ${slots}` : ''}</span><span>${t('lvl', { n: c.lvl })}${c.times > 1 ? t('col.times', { n: c.times }) : ''}</span>`;
    col.appendChild(row);
  }
  $('#soundBtn').textContent = t(sfx.muted ? 'sound.off' : 'sound.on');
  $('#pauseSoundBtn').textContent = t(sfx.muted ? 'sound.off' : 'sound.on');
}

document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const [who, d] = b.dataset.step.split(':');
  const key = who === 'hero' ? 'heroLvl' : who === 'count' ? 'count' : 'enemyLvl';
  G[key] = clamp(G[key] + Number(d), 1, key === 'count' ? 3 : 10);
  buildMenu();
}));
$('#runBtn').addEventListener('click', () => { sfx.ensure(); startRun(); });
$('#exploreBtn').addEventListener('click', () => { sfx.ensure(); startExplore(); });
$('#startBtn').addEventListener('click', () => { sfx.ensure(); startTraining(); });
$('#againBtn').addEventListener('click', () => { sfx.ensure(); startTraining(); });
$('#nextBtn').addEventListener('click', () => { sfx.ensure(); afterRunFight(); });
$('#menuBtn').addEventListener('click', () => {
  if (G.returnTo === 'editor' && window.CDEditor) { G.returnTo = null; toMenu(); window.CDEditor.open(); }
  else toMenu();
});
$('#quitBtn').addEventListener('click', () => {
  if (run && !confirm(t('confirm.quit'))) return;
  G.paused = false; hide(ui.pause); run = null; toMenu();
  if (G.returnTo === 'editor' && window.CDEditor) { G.returnTo = null; window.CDEditor.open(); }
});
ui.autoBtn.addEventListener('click', () => {
  sfx.ensure();
  G.auto = !G.auto;
  if (fight) { fight.autoGuard = false; fight.autoPlan = null; }
  resetInput();
});
$('#resumeBtn').addEventListener('click', () => { G.paused = false; hide(ui.pause); });
ui.pauseBtn.addEventListener('click', () => { if ((G.mode === 'fight' && !fight.over) || G.mode === 'map' || G.mode === 'explore') { G.paused = true; resetInput(); buildMenu(); fillPauseRelics(); show(ui.pause); } });
$('#soundBtn').addEventListener('click', () => { sfx.toggle(); buildMenu(); });
$('#langBtn').addEventListener('click', () => { const L = window.I18N.langs; window.I18N.setLang(L[(L.indexOf(window.I18N.lang) + 1) % L.length]); });
$('#pauseSoundBtn').addEventListener('click', () => { sfx.toggle(); buildMenu(); });
$('#resetBtn').addEventListener('click', () => {
  if (!confirm(t('confirm.reset'))) return;
  save = { captured: {}, fights: [], runs: [], muted: sfx.muted, squad: emptySquad() }; writeSave(); buildMenu();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'fight' && fight && !fight.over) { G.paused = true; resetInput(); buildMenu(); fillPauseRelics(); show(ui.pause); }
});

function startTraining() {
  run = null;
  // в группе к выбранной добавляются случайные обычные противницы
  const others = Object.keys(D.enemies).filter((id) => id !== G.selected && D.enemies[id].kind !== 'boss');
  const ids = [G.selected];
  while (ids.length < G.count && others.length) ids.push(pick(others.filter((id) => !ids.includes(id)).concat(others.length < G.count ? others : [])));
  newFight(ids, G.heroLvl, G.enemyLvl);
  G.mode = 'fight'; G.paused = false;
  hideAllOverlays(); show(ui.pauseBtn);
}
function toMenu() {
  G.mode = 'menu'; fight = null;
  hideAllOverlays(); hide(ui.pauseBtn); buildMenu(); show(ui.menu);
  ui.menu.scrollTop = 0;
}

function showResult() {
  const f = fight, s = f.stats, h = f.hero, e = f.enemy, ed = f.ed;
  G.mode = 'result';
  hide(ui.pauseBtn);
  const group = f.foes.length > 1;
  const gold = f.results.reduce((sum, r) => sum + Math.round((40 + 12 * r.lvl) * (r.outcome === 'escaped' ? 0.5 : 1)), 0);
  $('#resTitle').textContent = group && f.outcome !== 'lose' ? t('res.group') : resultTitle(f.outcome);
  $('#resTitle').className = f.outcome === 'lose' ? 'bad' : '';
  $('#resSub').textContent = group && f.outcome !== 'lose'
    ? f.results.map((r) => t('reward.groupLine', { name: r.ed.name, out: t('out.' + r.outcome) })).join(' · ') + '. ' + t('res.group.sub', { gold })
    : t(`res.${f.outcome}.sub`, { name: ed.name, gold });
  const dur = f.endT;
  const d = h.lvl - e.lvl, n = f.foes.length;
  const [lo, hi] = (e.kind === 'boss' ? [180, 300] : d === 0 ? [25, 60] : d > 0 ? [10, 25] : [60, 120]).map((v) => Math.round(v * (n > 1 ? n * 0.85 : 1)));
  const cls = dur < lo ? 'warn' : dur > hi ? 'bad' : 'ok';
  const verdict = t(dur < lo ? 'res.fast' : dur > hi ? 'res.slow' : 'res.ok');
  const items = [
    [t('st.time'), `<span class="${cls}">${fmtTime(dur)}</span>`, t('res.target', { lo: fmtTime(lo), hi: fmtTime(hi), v: verdict }), true],
    [t('st.taps'), s.taps], [t('st.slashes'), s.slashes],
    [t('st.parries'), s.parries], [t('st.blocks'), s.blocks],
    [t('st.links'), s.links], [t('st.breaks'), `${s.breaks} / ${f.foes.reduce((sum, x) => sum + x.enemy.parts, 0)}`],
    [t('st.combo'), h.maxCombo], [t('st.taken'), Math.round(s.taken)]
  ];
  if (s.vines) items.push([f.hazard.stat, s.vines]);
  if (s.captureTries) items.push([t('st.captures'), `${s.captures} / ${s.captureTries}`]);
  $('#resStats').innerHTML = items.map(([k, v, note, wide]) =>
    `<div class="stat${wide ? ' wide' : ''}"><div class="k">${k}</div><div class="v">${v}${note ? ` <span style="font-size:.6em;color:var(--ink-dim)">${note}</span>` : ''}</div></div>`).join('');
  const inRun = f.inRun && run;
  $('#nextBtn').classList.toggle('hidden', !inRun);
  $('#nextBtn').textContent = t(f.outcome === 'lose' ? 'res.toRun' : 'res.next');
  $('#againBtn').classList.toggle('hidden', !!inRun);
  $('#menuBtn').classList.toggle('hidden', !!inRun);
  show(ui.result);
  ui.result.scrollTop = 0;
}
