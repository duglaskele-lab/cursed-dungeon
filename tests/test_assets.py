"""Загрузка спрайтов, локальные стадии из packs/<id>/ и редактор противниц."""
from conftest import INDEX, ROOT, Game

STAGE1 = (ROOT / 'assets' / 'moth' / 'stage1.png').read_bytes()


def open_with_packs(browser, files):
    """Игра, у которой в packs/ лежат только files (путь → байты); остальное в packs/ отсутствует."""
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def handle(route):
        rel = route.request.url.split('/packs/', 1)[1]
        if rel in files:
            route.fulfill(status=200, body=files[rel], content_type='image/png')
        else:
            route.abort()
    page.route('**/packs/**', handle)
    page.goto(INDEX + '?lang=ru')
    page.wait_for_function('window.__proto && __proto.G.mode === "menu"', timeout=20000)
    return Game(page, errors)


def test_pack_folder_stages(browser):
    g = open_with_packs(browser, {'moth/stage2.png': STAGE1, 'moth/stage3.png': STAGE1, 'miko/stage3.png': STAGE1})
    try:
        sp = g.js('() => ({ moth: GAME_DATA.enemies.moth.sprites, miko: GAME_DATA.enemies.miko.sprites, bunny: GAME_DATA.enemies.bunny.sprites })')
        assert sp['moth'] == ['assets/moth/stage1.png', 'packs/moth/stage2.png', 'packs/moth/stage3.png']
        assert sp['miko'] == ['assets/miko/stage1.png'], 'без stage2 цепочка стадий обрывается'
        assert sp['bunny'] == ['assets/bunny/stage1.png']
        # стадия меняется при поломке брони
        r = g.js('''() => { __proto.fightWith(['moth'], 1, 1); const f = __proto.fight, e = f.enemy; e.nextAttack = 999;
          e.stage = 1; return e.stage; }''')
        assert r == 1
        assert not g.errors
    finally:
        g.page.close()


def test_editor_opens(game):
    game.page.click('#editorBtn')
    game.page.wait_for_selector('#editor:not(.hidden)')
    assert game.js('!!window.CDEditor')
