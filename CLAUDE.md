# Карта проекта для ИИ-помощника

Рогалик-кликер на чистом JS + Canvas 2D. Без сборки: `index.html` открывается двойным щелчком,
поэтому только обычные `<script>`, без ES-модулей (с file:// они не грузятся).

## Где что лежит

- `js/data.js` — ВСЕ числа баланса и контент: `hero`, `elements`, `enemies`, `relics`, `upgrades`, `floor`.
  Правки баланса — только здесь.
- `js/game.js` (~2400 строк, один IIFE). Разделы помечены комментариями `// ----`:
  - экран и сохранение (`SAVE_KEY`, localStorage), звук (`sfx`, синтез Web Audio), ассеты;
  - псевдо-3D фон: `THEMES`, `buildTheme`, `drawBackground` (темы `dungeon`, `spirit`, `jungle`);
  - бой: `newFight`, `heroTap`, `heroSlash`, `guardPress`/`enemyImpact` (защита нажатием в круг удара),
    `tryBreak`/`breakArmor`/`subdue`/`capture`, сферы `spawnSpheres`/`sphereBurst`/`resolveSwipe`,
    помехи босса `HAZARDS` + `spawnVine`/`updateVines`/`drawVines`/`drawWisps`;
  - отрисовка боя: `renderFight`, `drawTopHud`, `drawBottomHud`;
  - забег: `genFloor`, `renderMap`/`drawDoor`/`drawMiniMap`, `enterNode`, `afterRunFight`, `EVENTS`, `showRest`;
  - ввод: `onPress`/`onMove`/`onRelease` (Pointer Events);
  - API для редактора: `window.CD`; хук автотестов: `window.__proto`.
- `js/i18n.js` + `js/lang/ru.js`, `js/lang/en.js` — локализация. `t('ключ', {подстановки})` в game.js и editor.js;
  статичный HTML — атрибуты `data-i18n`, `data-i18n-html`, `data-i18n-aria`. Русские тексты контента (имена, описания,
  реликвии) лежат в `data.js`, их английский перевод — в `en.js` → `content` (по id). Язык меняется перезагрузкой страницы.
- `js/editor.js` — редактор противниц (обработка фона в браузере, IndexedDB, экспорт zip/json).
- `packs/` — локальные спрайты пользователя, в git НЕ попадают. Никогда не добавлять их в коммиты.

## Правила

- Броня: `armor` в данных = число частей; спрайтов может быть меньше (`spriteIndex`).
- Фазы босса = `armor + 1`, меняются на каждой сломанной части (`applyPhase`).
- Цели длительности боя: рядовой равного уровня 25–60 с (не дольше 2 мин), слабее героя 10–25 с,
  сильнее 1–2 мин, мини-босс ~1 мин, босс 3–5 мин.
- Любой текст для игрока — только через `t()`: новый ключ добавлять сразу в оба файла `js/lang/*.js`.
  Не называть локальные переменные `t` в функциях, где вызывается перевод.
- Репозиторий публичный: только безопасные (R) спрайты.
- Проверка: headless Chromium через Playwright, хук `window.__proto` (`startFight`, `startRun`,
  `press/move/release`, `guardCenter`, `chooseDoor`).
