// Локализация: язык выбирается один раз при загрузке страницы (?lang=en, сохранённый выбор или язык браузера).
// Тексты интерфейса — js/lang/<язык>.js (ui), переводы текстов из data.js — там же (content).
// Нет ключа в выбранном языке — берётся русский, нет и в русском — показывается сам ключ.
'use strict';
(function () {
  const LANGS = window.LANGS || {};
  const KEY = 'cursed_dungeon_lang';
  const SUPPORTED = Object.keys(LANGS);

  function detect() {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (SUPPORTED.includes(q)) return q;
    } catch (e) { /* ignore */ }
    try {
      const s = localStorage.getItem(KEY);
      if (SUPPORTED.includes(s)) return s;
    } catch (e) { /* хранилище недоступно */ }
    const nav = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
    return /^(ru|be|uk|kk)\b/.test(nav) && LANGS.ru ? 'ru' : LANGS.en ? 'en' : SUPPORTED[0];
  }

  const lang = detect();
  const dict = (LANGS[lang] && LANGS[lang].ui) || {};
  const base = (LANGS.ru && LANGS.ru.ui) || {};

  function t(key, vars) {
    let v = dict[key];
    if (v === undefined) v = base[key];
    if (v === undefined) return key;
    if (typeof v === 'function') return v(vars || {});
    return vars ? v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : v;
  }

  // Смена языка перезагружает страницу: так все тексты, включая данные героинь, берутся заново
  function setLang(l) {
    if (!LANGS[l]) return;
    try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ }
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); location.href = u.toString(); } else location.reload();
  }

  function merge(dst, src) {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === 'object' && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
      else dst[k] = v;
    }
  }
  // Переводит тексты в GAME_DATA на месте: героини и стихии по ключу, реликвии и улучшения по id
  function localize(D) {
    const c = LANGS[lang] && LANGS[lang].content;
    if (!D || !c) return;
    for (const sec of ['enemies', 'elements']) {
      for (const [id, o] of Object.entries(c[sec] || {})) if (D[sec] && D[sec][id]) merge(D[sec][id], o);
    }
    for (const sec of ['relics', 'upgrades']) {
      for (const r of D[sec] || []) if (c[sec] && c[sec][r.id]) Object.assign(r, c[sec][r.id]);
    }
    if (c.floor && D.floor) merge(D.floor, c.floor);
    if (c.explore && D.explore) merge(D.explore, c.explore);
  }

  // Статичные тексты в HTML: data-i18n — текст, data-i18n-html — разметка, data-i18n-aria — подпись кнопки
  function applyDom(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  }

  window.I18N = { lang, langs: SUPPORTED, t, setLang, localize, applyDom };
  document.documentElement.lang = lang;
  document.title = t('doc.title');
  localize(window.GAME_DATA);
  applyDom();
})();
