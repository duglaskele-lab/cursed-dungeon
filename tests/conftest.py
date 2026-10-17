"""Общие настройки автотестов: один headless Chromium на всю сессию, новая страница на каждый тест.

Игра открывается как file:// (как у игрока двойным щелчком). Папка packs/ блокируется, чтобы локальные
спрайты и pack.js не влияли на результат. Любая ошибка JS на странице роняет тест.
"""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()


@pytest.fixture(scope='session')
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


class Game:
    """Страница с запущенной игрой и хуком window.__proto."""

    def __init__(self, page, errors):
        self.page = page
        self.errors = errors

    def js(self, expr, arg=None):
        return self.page.evaluate(expr, arg)


@pytest.fixture
def open_game(browser):
    pages = []

    def _open(lang='ru', query=''):
        page = browser.new_page(viewport={'width': 540, 'height': 960})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.accept())
        page.route('**/packs/**', lambda r: r.abort())
        page.goto(f'{INDEX}?lang={lang}{query}')
        page.wait_for_function('window.__proto && __proto.G.mode === "menu"', timeout=20000)
        g = Game(page, errors)
        pages.append(g)
        return g

    yield _open
    for g in pages:
        errs = list(g.errors)
        g.page.close()
        assert not errs, f'ошибки JS на странице: {errs}'


@pytest.fixture
def game(open_game):
    return open_game('ru')
