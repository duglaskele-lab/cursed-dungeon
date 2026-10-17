// Отряд в интерфейсе: строка отряда, выбор спутниц для слота (pickCompanion, showSquadPanel).
'use strict';

// ---------------------------------------------------------------- отряд: выбор спутниц
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function squadSummary() {
  return D.squad.map((s) => { const id = squadMember(s); return `${t('slot.' + s)}: ${id ? D.enemies[id].name : t('squad.empty')}`; }).join(' · ');
}
function companionLine(id) {
  return companionSlots(id).map((s) => `${t('slot.' + s).toLowerCase()} — ${bonusText(slotBonus(id, s))}`).join('; ');
}
// список спутниц для слота: пойманные можно выбрать, остальные видны как подсказка
function pickCompanion(slot, back) {
  const cur = squadMember(slot);
  const ids = Object.keys(D.enemies).filter((id) => slotBonus(id, slot))
    .sort((a, b) => (save.captured[b] ? 1 : 0) - (save.captured[a] ? 1 : 0));
  const choices = ids.map((id) => {
    const caught = !!save.captured[id];
    const other = D.squad.find((s) => s !== slot && squadMember(s) === id);
    const note = !caught ? t('squad.notCaught') : other ? t('squad.inSlot', { slot: t('slot.' + other).toLowerCase() }) : '';
    return {
      title: D.enemies[id].name, desc: cap(bonusText(slotBonus(id, slot))) + (note ? ' · ' + note : ''),
      ck: id === cur ? t('squad.here') : '', disabled: !caught, on: () => { setSquad(slot, id); back(); }
    };
  });
  if (cur) choices.push({ title: t('squad.free'), on: () => { setSquad(slot, null); back(); } });
  choices.push({ title: t('squad.back'), on: back });
  showPanel({ kicker: t('squad.title'), title: t('slot.' + slot), img: cur ? D.enemies[cur].sprites[0] : null, text: ids.length ? t('squad.pickText') : t('squad.noCompanion'), choices });
}
function showSquadPanel(done) {
  showPanel({
    kicker: t('squad.title'), title: t('squad.title'), text: t('squad.text'),
    choices: [
      ...D.squad.map((slot) => {
        const id = squadMember(slot);
        return {
          title: `${t('slot.' + slot)}: ${id ? D.enemies[id].name : t('squad.empty')}`,
          desc: id ? cap(bonusText(slotBonus(id, slot))) : t('squad.emptyDesc'),
          on: () => pickCompanion(slot, () => showSquadPanel(done))
        };
      }),
      { title: t('squad.done'), on: done }
    ]
  });
}
