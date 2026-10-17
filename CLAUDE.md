# Карта проекта для ИИ-помощника

Рогалик-кликер на чистом JS + Canvas 2D. Без сборки: `index.html` открывается двойным щелчком,
поэтому только обычные `<script>`, без ES-модулей (с file:// они не грузятся).

## Где что лежит

- `js/data.js` — ВСЕ числа баланса и контент: `hero`, `elements`, `enemies`, `relics`, `upgrades`,
  `floor` (зоны этажа с пулами противниц, фиксированные комнаты `fixed`, веса типов комнат, разведка `scout`),
  `squad` (слоты отряда) и `companion` у героинь (бонус по слотам), `group` (сила противниц в группе),
  `explore` (режим исследования: размер, комнаты, содержимое, монументы, угроза).
  Правки баланса — только здесь.
- `js/game.js` (~2400 строк, один IIFE). Разделы помечены комментариями `// ----`:
  - экран и сохранение (`SAVE_KEY`, localStorage), звук (`sfx`, синтез Web Audio), ассеты (`loadAssets`, `findPackStages`);
  - псевдо-3D фон: `THEMES`, `buildTheme`, `drawBackground` (темы `dungeon`, `spirit`, `jungle`);
  - противницы в бою: `fight.foes` (`makeFoe`), передняя `setFront` — на неё указывают `fight.enemy/ed/id/layout`;
    расстановка `foeLayout`/`layoutFoes` (цель) и `posRect` (где нарисована сейчас), задние — `updateBacks`
    (сферы, нить лечения `fight.threads`, выход вперёд `stepForward`), росчерк по задним `slashBack`;
    выбыла передняя — `foeDone` (следующая случайная, `updateNextFoe`), задняя — `backDone`; итоги — `fight.results`;
    близкий кадр при поломке брони — `fight.cam`, `camZoom`;
  - бой: `newFight`, `heroTap`, `heroSlash`, `guardPress`/`enemyImpact` (защита нажатием в круг удара),
    `tryBreak`/`breakArmor`, захват кругом `circleGesture`/`tryCapture`/`capture`, сферы `spawnSpheres`/`sphereBurst`/`resolveSwipe`,
    помехи босса `HAZARDS` + `spawnVine`/`updateVines`/`drawVines`/`drawWisps`;
  - отряд: `BONUS` (виды бонусов → модификаторы героя), `withSquad` (накладывает бонусы на `mods` в `makeHero`),
    `squadMember`/`setSquad` (сохраняется в `save.squad`), выбор — `pickCompanion`/`showSquadPanel`;
    портреты — `portraitSpot`/`portraitRect`/`portraitStyle` (голова по `portrait` в data.js или по силуэту),
    слоты в бою `squadSlotRect`, подсказка `drawSquadTip` (наведение `G.hover` или касание `G.slotTip`);
  - автобой: `updateAuto`/`autoPlan` (атакует, блокирует через `fight.autoGuard`, не парирует и не захватывает),
    флаг `G.auto`, кнопка `#autoBtn`;
  - отрисовка боя: `renderFight`, `drawTopHud`, `drawBottomHud`;
  - этаж: `genFloor` = `layoutFloor` (пояса комнат в координатах u вдоль пути / v поперёк, 0…`MAP_V`)
    + `linkBands` (двери только между соседними поясами, где стены перекрываются ≥ `DOOR_MIN`) + `assignRooms`
    (типы комнат по правилам `D.floor`); план подземелья `drawFloorMap` (мини и большой, туман `knownRooms`,
    статичная часть кэшируется в `mapTexture`), выбор комнаты `chooseDoor`/`chooseNode`/`mapPointer`;
  - забег: `renderMap`/`drawDoor`, `enterNode`, `afterRunFight`, `EVENTS`, `showRest`; экран забега — `runScreen()`
    (`map` для графа, `explore` для исследования);
  - режим исследования: `startExplore`, генерация `tryDungeon`/`genDungeon` (клетки `T_WALL/T_ROOM/T_HALL`) и
    `fillDungeon`, туман `exReveal`/`exLit`, ходьба `exGoTo`/`updateExplore`/`exStep` (угроза, засада `ambushNode`,
    монументы `useMonument`), отрисовка `renderExplore` (кэш `exTexture`), ввод `explorePointer`;
  - ввод: `onPress`/`onMove`/`onRelease` (Pointer Events);
  - API для редактора: `window.CD`; хук автотестов: `window.__proto`.
- `js/i18n.js` + `js/lang/ru.js`, `js/lang/en.js` — локализация. `t('ключ', {подстановки})` в game.js и editor.js;
  статичный HTML — атрибуты `data-i18n`, `data-i18n-html`, `data-i18n-aria`. Русские тексты контента (имена, описания,
  реликвии) лежат в `data.js`, их английский перевод — в `en.js` → `content` (по id). Язык меняется перезагрузкой страницы.
- `js/editor.js` — редактор противниц (обработка фона в браузере, IndexedDB, экспорт zip/json).
- `packs/` — локальные спрайты пользователя, в git НЕ попадают. Никогда не добавлять их в коммиты.
  Стадии ищутся сами: `packs/<id>/stageN.png` (`findPackStages` в `loadAssets`); `packs/pack.js` (`GAME_PACK`) главнее.

## Правила

- Броня: `armor` в данных = число частей; спрайтов может быть меньше (`spriteIndex`).
- Фазы босса = `armor + 1`, меняются на каждой сломанной части (`applyPhase`).
- Выносливость противниц восстанавливается всегда (`stamRegen`), парирование и связка сфер останавливают это
  на 2 с (`e.regenStop`); обычные удары восстановление не останавливают.
- Без брони (`isLastStage`) урон ×`D.broken.dmgMul`, противница не сдаётся: бой до 0 здоровья (`defeated`)
  или до захвата кругом (шанс `captureChance`, неудача = `heroSlash`). Здоровье кончилось раньше брони — `escaped`.
- Цели длительности боя: рядовой равного уровня 25–60 с (не дольше 2 мин), слабее героя 10–25 с,
  сильнее 1–2 мин, мини-босс ~1 мин, босс 3–5 мин.
- Любой текст для игрока — только через `t()`: новый ключ добавлять сразу в оба файла `js/lang/*.js`.
  Не называть локальные переменные `t` в функциях, где вызывается перевод.
- Репозиторий публичный: только безопасные (R) спрайты.
- Автотесты: `python -m pytest` (папка `tests/`, CI — `.github/workflows/tests.yml`). Перед каждым коммитом —
  весь набор зелёный; новая механика или контент — сразу тест. Бот забега — `tests/test_run.py` (`BOT`).
- Проверка вручную: headless Chromium через Playwright, хук `window.__proto` (`startFight`, `startRun`,
  `press/move/release`, `circle`, `captureChance`, `guardCenter`, `chooseDoor`, `chooseNode`, `genFloor`,
  `fightWith(ids, h, e)` — групповой бой, `startExplore`, `genDungeon`, `exGoTo`, `setAuto`, `setSpeed`,
  `fastForward(сек)` — прокрутить игровое время мгновенно; с автобоем бой считается за ~20 мс).
  Ускорение вручную: `index.html?speed=4`. Балансные прогоны — автобой + `fastForward`, а не ожидание в реальном времени.
- Групповой бой: прямо атакует только передняя; задние только помогают. Новая механика боя должна работать
  и для одной, и для нескольких противниц (одиночный бой — частный случай группы).
- Отряд: бонус задаётся видом противницы; обычная — 1 бонус и 1 слот, элита/босс — до 3; одна спутница — один слот.
  Бонус здоровья (`hp`) — запас на бой: после боя здоровье героя не выше, чем было до боя.
- Этаж: путь = 1 + сумма `zones[].rooms`, затем босс. Из комнаты 1–3 двери, тупиков и недостижимых комнат нет,
  двери не пересекаются. После правок генератора — прогнать проверку на нескольких тысячах `genFloor()`.
