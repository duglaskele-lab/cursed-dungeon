// Образец локального пакета. Скопируйте в packs/pack.js — он не попадёт в git.
// Файл подключается после js/data.js и до игры: любое поле героини из data.js можно переопределить,
// новые героини добавляются так же (для новой нужны все поля, как в data.js).
// Спрайты стадий — от целой брони к «сломлена», на одном холсте одного размера, низ по центру (ступни).
window.GAME_PACK = {
  enemies: {
    // miko: {
    //   sprites: ['packs/x/miko/stage1.png', 'packs/x/miko/stage2.png', 'packs/x/miko/stage3.png'],
    //   armor: 2,
    //   portrait: { x: 0.3, y: 0.112 }   // где голова (доли ширины и высоты) — для портрета в отряде
    // }
  }
};

// Новая героиня в забеге: добавьте её id в пул зоны этажа и/или в элиту/боссов.
// if (window.GAME_PACK.enemies.my_girl) {
//   window.GAME_DATA.floor.zones[1].pool.push('my_girl');   // зона 2: комнаты 5–8
//   // window.GAME_DATA.floor.elite = [].concat(window.GAME_DATA.floor.elite, 'my_girl');
// }
