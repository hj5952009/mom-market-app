"""런처·알림·스플래시 아이콘 만들기 (specs/ux1_design.md 5-2) — python3 tools/make-icons.py
108dp 캔버스: 배경 #FFF1D9, 지름 60dp 테두리(6dp, #7A4E08), 눈금 4개, 오른쪽 위 45° 마름모 바늘(위 빨강·아래 파랑), 가운데 흰 축."""
import math, os, glob
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
BRAND, RED, BLUE, BG, PAGE = (122, 78, 8, 255), (198, 40, 40, 255), (21, 101, 192, 255), (255, 241, 217, 255), (250, 247, 242, 255)
SS = 4  # 슈퍼샘플링


def compass(draw, s, ox=0, oy=0, mono=None):
    """s: 1dp당 픽셀(슈퍼샘플 포함). 108dp 캔버스 기준 좌표."""
    c = lambda v: v * s
    cx, cy = ox + c(54), oy + c(54)
    col = (lambda k: mono) if mono else (lambda k: k)
    r = c(30)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col(BRAND), width=int(round(c(6))))
    for ang in (0, 90, 180, 270):  # 테두리 안쪽 눈금
        a = math.radians(ang)
        r1, r2 = c(27 - 0.5), c(27 - 6.5)
        x1, y1 = cx + r1 * math.sin(a), cy - r1 * math.cos(a)
        x2, y2 = cx + r2 * math.sin(a), cy - r2 * math.cos(a)
        draw.line([x1, y1, x2, y2], fill=col(BRAND), width=int(round(c(4))))
    # 바늘: 길이 44, 폭 14, 오른쪽 위 45°
    L, Wd = c(22), c(7)
    ux, uy = math.sin(math.radians(45)), -math.cos(math.radians(45))  # 바늘 방향(오른쪽 위)
    px, py = -uy, ux                                               # 수직
    tip = (cx + ux * L, cy + uy * L)
    tail = (cx - ux * L, cy - uy * L)
    left = (cx + px * Wd, cy + py * Wd)
    right = (cx - px * Wd, cy - py * Wd)
    if mono:
        draw.polygon([tip, left, tail, right], outline=mono, width=int(round(c(3))))
        draw.line([left, right], fill=mono, width=int(round(c(2))))
    else:
        draw.polygon([tip, left, right], fill=RED)
        draw.polygon([tail, left, right], fill=BLUE)
    rr = c(5)
    draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 255, 255, 255) if not mono else (0, 0, 0, 0), outline=col(BRAND), width=int(round(c(2))))


def render(px, bg=None, shape='square', mono=None, zoom=1.0):
    S = px * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        if shape == 'circle':
            d.ellipse([0, 0, S - 1, S - 1], fill=bg)
        elif shape == 'rounded':
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.2), fill=bg)
        else:
            d.rectangle([0, 0, S, S], fill=bg)
    s = S / 108 * zoom
    off = (S - 108 * s) / 2
    compass(d, s, off, off, mono)
    return im.resize((px, px), Image.LANCZOS)


DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, k in DENS.items():
    md = os.path.join(RES, 'mipmap-' + name)
    os.makedirs(md, exist_ok=True)
    legacy = int(48 * k)
    render(legacy, BG, 'rounded', zoom=1.45).save(os.path.join(md, 'ic_launcher.png'))
    render(legacy, BG, 'circle', zoom=1.45).save(os.path.join(md, 'ic_launcher_round.png'))
    render(int(108 * k)).save(os.path.join(md, 'ic_launcher_foreground.png'))
    render(int(108 * k), mono=(255, 255, 255, 255)).save(os.path.join(md, 'ic_launcher_monochrome.png'))
    dd = os.path.join(RES, 'drawable-' + name)
    os.makedirs(dd, exist_ok=True)
    # 알림 아이콘 24dp, 흰색 + 투명 (테두리 + 바늘 윤곽)
    render(int(24 * k), mono=(255, 255, 255, 255), zoom=108 / 66).save(os.path.join(dd, 'ic_stat_compass.png'))

for f in ('drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_background.xml'):
    p = os.path.join(RES, f)
    if os.path.exists(p):
        os.remove(p)
adaptive = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
'''
for f in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    open(os.path.join(RES, 'mipmap-anydpi-v26', f), 'w').write(adaptive)
open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFF1D9</color>\n    <color name="splash_background">#FAF7F2</color>\n</resources>\n')

# 스플래시: 미색 바탕 가운데 아이콘 96dp + "시장 나침반"
font = None
for cand in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc']:
    if os.path.exists(cand):
        font = cand
        break
for p in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
    w, h = Image.open(p).size
    im = Image.new('RGBA', (w, h), PAGE)
    unit = min(w, h) / 360  # 360dp 폭 기준
    ic = render(int(96 * unit * 1.0), BG, 'rounded', zoom=1.45)
    im.alpha_composite(ic, (int((w - ic.width) / 2), int(h / 2 - ic.height * 0.75)))
    if font:
        d = ImageDraw.Draw(im)
        f = ImageFont.truetype(font, int(26 * unit), index=1 if font.endswith('.ttc') else 0)
        t = '시장 나침반'
        tw = d.textlength(t, font=f)
        d.text(((w - tw) / 2, h / 2 + ic.height * 0.35), t, font=f, fill=(26, 26, 26, 255))
    im.convert('RGB').save(p)

WWW = os.path.join(ROOT, 'www', 'img')
os.makedirs(WWW, exist_ok=True)
render(192, BG, 'rounded', zoom=1.45).save(os.path.join(WWW, 'icon-192.png'))
render(512, BG, 'rounded', zoom=1.45).save(os.path.join(WWW, 'icon-512.png'))
print('icons written')
