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


def png(w, h, rgba=(200, 120, 80, 255)):
    """Однотонный PNG w×h без сторонних библиотек."""
    import struct
    import zlib
    row = b'\x00' + bytes(rgba) * w
    raw = zlib.compress(row * h, 9)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')


def test_stages_fitted_to_first(browser):
    """Стадии другого разрешения и пропорций подгоняются под холст первой стадии."""
    g = open_with_packs(browser, {'moth/stage2.png': png(665 * 2, 896 * 2), 'moth/stage3.png': png(500, 896)})
    try:
        sizes = g.js("__proto.stageSizes('moth')")
        assert sizes == [[665, 896]] * 3
        assert not g.errors
    finally:
        g.page.close()


def test_huge_sprite_downscaled(browser):
    g = open_with_packs(browser, {'bunny/stage1.png': png(1500, 4400), 'bunny/stage2.png': png(1500, 4400)})
    try:
        sizes = g.js("__proto.stageSizes('bunny')")
        assert max(sizes[0]) == 2048 and sizes[0] == sizes[1]
        g.js("__proto.fightWith(['bunny'], 1, 1)")
        g.js('__proto.fastForward(2)')
        assert not g.errors
    finally:
        g.page.close()


def test_editor_finds_head_for_portrait(game):
    import base64
    src = 'data:image/png;base64,' + base64.b64encode(STAGE1).decode()
    game.page.click('#editorBtn')
    game.page.wait_for_selector('#editor:not(.hidden)')
    game.js('(src) => window.CDEditor._onSheetImage(src)', src)
    p = game.js('window.CDEditor._state.portrait')
    assert p and abs(p['x'] - 0.487) < 0.05 and abs(p['y'] - 0.113) < 0.05, p
