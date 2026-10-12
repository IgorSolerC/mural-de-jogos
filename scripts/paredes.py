"""As paredes do perfil (PAGE_BACKGROUNDS em src/app/core/profile.ts): os desenhos vão para
public/paredes/<id>.svg (e <id>-2.svg), o CSS para o mixin `paredes` em src/app/ui/_profile-materials.scss.

Rodar da raiz do projeto: python scripts/paredes.py. Os sorteios têm semente fixa, então rodar de novo dá os
mesmos desenhos; para mudar uma parede, mexa só no bloco dela (as outras saem iguais). Todo ladrilho precisa
emendar sem marca: o que passa da beirada volta do outro lado (tiled), e o ruído leva a região do filtro do
tamanho do ladrilho com stitchTiles."""
import math, os, random
from urllib.parse import unquote

HERE = os.path.dirname(os.path.abspath(__file__))

# ===== Os desenhos das oito primeiras paredes (data URIs, que viram arquivos mais abaixo) =====

def enc(svg):
    svg = ' '.join(svg.split())
    return 'url("data:image/svg+xml,' + svg.replace('%', '%25').replace('"', "'").replace('<', '%3C').replace('>', '%3E').replace('#', '%23') + '")'

def noise(freq, octaves, matrix, size=300, seed=None):
    s = f" seed='{seed}'" if seed is not None else ''
    return enc(f"<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='{freq}' numOctaves='{octaves}'{s} stitchTiles='stitch'/><feColorMatrix values='{matrix}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")

# ===== Planta azul: os desenhos de engenharia, a lápis branco =====
blue = enc("""<svg xmlns='http://www.w3.org/2000/svg' width='960' height='960' fill='none' stroke='#e6f0ff' stroke-width='1.3' stroke-opacity='.22'>
<circle cx='190' cy='200' r='58'/><circle cx='190' cy='200' r='22'/>
<path d='M110 200h160M190 120v160' stroke-dasharray='14 5 3 5'/>
<path d='M120 330h140M120 322v16M260 322v16M120 330l10-4v8zM260 330l-10-4v8z'/>
<text x='176' y='322' fill='#e6f0ff' fill-opacity='.3' stroke='none' font-family='monospace' font-size='12'>140</text>
<rect x='520' y='120' width='250' height='150'/>
<circle cx='555' cy='155' r='9'/><circle cx='735' cy='155' r='9'/><circle cx='555' cy='235' r='9'/><circle cx='735' cy='235' r='9'/>
<path d='M520 270l250-150' stroke-dasharray='6 6'/>
<path d='M500 120v150M492 120h16M492 270h16'/>
<path d='M300 560a120 120 0 0 1 240 0' /><path d='M300 560h240M420 560v-120' stroke-dasharray='10 6'/>
<path d='M120 700l60-60 60 60-60 60z'/><circle cx='180' cy='700' r='4'/>
<path d='M660 480l40 70h-80z'/>
<rect x='640' y='780' width='260' height='120'/><path d='M640 820h260M640 860h260M760 780v120'/>
<text x='652' y='808' fill='#e6f0ff' fill-opacity='.32' stroke='none' font-family='monospace' font-size='13' letter-spacing='2'>MEU MURAL</text>
<text x='652' y='848' fill='#e6f0ff' fill-opacity='.28' stroke='none' font-family='monospace' font-size='11' letter-spacing='1'>PLANTA 01</text>
<text x='772' y='848' fill='#e6f0ff' fill-opacity='.28' stroke='none' font-family='monospace' font-size='11' letter-spacing='1'>ESC 1:50</text>
<text x='652' y='888' fill='#e6f0ff' fill-opacity='.28' stroke='none' font-family='monospace' font-size='11' letter-spacing='1'>REV. A</text>
<path d='M60 860h300' stroke-dasharray='2 6'/><path d='M860 60v300' stroke-dasharray='2 6'/>
</svg>""")

# ===== Lousa: o apagador passou, ficou o pó =====
chalk = enc("""<svg xmlns='http://www.w3.org/2000/svg' width='1100' height='800' fill='none' stroke='#fff' stroke-linecap='round'>
<filter id='b' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='9'/></filter>
<g filter='url(#b)' stroke-opacity='.05' stroke-width='60'>
<path d='M80 160c160-60 330-70 520-10'/><path d='M640 520c120-50 260-40 380 20'/><path d='M120 640c90 30 200 30 300-10'/>
</g>
<g stroke-opacity='.07' stroke-width='2.2'>
<path d='M720 150c20-30 60-30 70 0s-30 50-60 40'/><path d='M820 140h40M840 120v40'/>
<path d='M230 470c40-40 80 40 120 0s80 40 120 0'/>
</g>
</svg>""")

# ===== Jeans: a costura dupla em linha laranja, com a dobra do tecido =====
seam = enc("""<svg xmlns='http://www.w3.org/2000/svg' width='624' height='624'>
<rect x='560' width='30' height='624' fill='#000' fill-opacity='.22'/>
<rect x='562' width='2' height='624' fill='#fff' fill-opacity='.06'/>
<path d='M556 0v624M594 0v624' stroke='#d8963c' stroke-opacity='.75' stroke-width='1.8' stroke-dasharray='8 5'/>
</svg>""")

# ===== Céu de planetário: estrelas sorteadas (sempre as mesmas) e uma constelação =====
rnd = random.Random(7)
stars = []
for _ in range(70):
    x, y = rnd.uniform(6, 694), rnd.uniform(6, 694)
    r = rnd.choice([0.6, 0.7, 0.8, 0.9, 1.1, 1.4, 1.8])
    o = round(rnd.uniform(0.35, 0.95), 2)
    stars.append(f"<circle cx='{x:.0f}' cy='{y:.0f}' r='{r}' fill-opacity='{o}'/>")
const = [(470, 120), (520, 160), (575, 150), (610, 205), (560, 250), (640, 270)]
lines = ' '.join(f"M{a[0]} {a[1]}L{b[0]} {b[1]}" for a, b in zip(const, const[1:]))
cstars = ''.join(f"<circle cx='{x}' cy='{y}' r='2.1'/>" for x, y in const)
sky = enc(f"""<svg xmlns='http://www.w3.org/2000/svg' width='700' height='700' fill='#fff'>
{''.join(stars)}
<path d='{lines}' stroke='#cfe0ff' stroke-opacity='.22' stroke-width='1' stroke-dasharray='3 4'/>
{cstars}
<path d='M150 520l3 9 9 3-9 3-3 9-3-9-9-3 9-3z' fill-opacity='.85'/>
</svg>""")
rnd2 = random.Random(21)
dust = enc("<svg xmlns='http://www.w3.org/2000/svg' width='230' height='230' fill='#fff'>" + ''.join(
    f"<circle cx='{rnd2.uniform(3,227):.0f}' cy='{rnd2.uniform(3,227):.0f}' r='.55' fill-opacity='{rnd2.uniform(.2,.6):.2f}'/>" for _ in range(26)) + "</svg>")

# ===== Tijolinho: a parede de tijolo pintada de escuro, o rejunte fundo =====
rnd3 = random.Random(4)
tones = ['#4a2a22', '#43261f', '#522f26', '#3d231d', '#4f2c21', '#462822', '#56322a']
bricks = []
W, H = 84, 30
for row in range(6):
    y = row * (H + 4) + 2
    off = 0 if row % 2 == 0 else -(W + 4) // 2
    row_tones = [rnd3.choice(tones) for _ in range(4)]
    for col in range(-1, 5):
        x = off + col * (W + 4) + 2
        bricks.append(f"<rect x='{x}' y='{y}' width='{W}' height='{H}' rx='2' fill='{row_tones[col % 4]}'/>")
tw, th = 4 * (W + 4), 6 * (H + 4)
brick = enc(f"""<svg xmlns='http://www.w3.org/2000/svg' width='{tw}' height='{th}'>
<rect width='100%' height='100%' fill='#1a1210'/>{''.join(bricks)}
</svg>""")

# ===== Assoalho de nogueira: tábuas deitadas, com as emendas em lugares diferentes =====
rows = 5
ph = 96
joints = [(140, 430), (40, 330), (250, 540), (90, 390), (200, 500)]
tints = [("#fff", .025), ("#000", .12), ("#000", .06), ("#fff", .04), ("#000", .1)]
planks = ''
for i in range(rows):
    y = i * ph
    planks += f"<rect y='{y}' width='600' height='2' fill='#000' fill-opacity='.55'/><rect y='{y+2}' width='600' height='1' fill='#fff' fill-opacity='.06'/>"
    a, b = joints[i]
    # a tábua do meio, entre as duas emendas, num tom; a outra (que dá a volta no ladrilho) fica no tom da madeira
    color, alpha = tints[i]
    planks += f"<rect x='{a+2}' y='{y+2}' width='{b-a-2}' height='{ph-2}' fill='{color}' fill-opacity='{alpha}'/>"
    for x in (a, b):
        planks += f"<rect x='{x}' y='{y}' width='2' height='{ph}' fill='#000' fill-opacity='.5'/>"
floor = enc(f"<svg xmlns='http://www.w3.org/2000/svg' width='600' height='{rows*ph}'>{planks}</svg>")

fine_white = noise('.65', 4, '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .05 0')
chalk_dust = noise('.9', 2, '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .09 0', 240)
denim_slub = noise('.012 .6', 3, '0 0 0 0 .8 0 0 0 0 .86 0 0 0 0 1 0 0 0 .09 0', 320, 3)
wood_grain = noise('.0035 .28', 4, '0 0 0 0 .08 0 0 0 0 .04 0 0 0 0 .02 0 0 0 .8 -.32', 600, 9)



ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'public', 'paredes')
os.makedirs(OUT, exist_ok=True)


def raw(datauri):
    """O SVG de um url("data:...") gerado por enc()."""
    return unquote(datauri[len('url("data:image/svg+xml,'):-2])


def save(name, svg):
    svg = ' '.join(svg.split())
    open(f'{OUT}/{name}.svg', 'w', encoding='utf-8').write(svg)
    return len(svg)


def noise_svg(freq, octaves, matrix, size, seed=None, extra=''):
    s = f" seed='{seed}'" if seed is not None else ''
    return (f"<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='{freq}' "
            f"numOctaves='{octaves}'{s} stitchTiles='stitch'/><feColorMatrix values='{matrix}'/></filter>"
            f"<rect width='{size}' height='{size}' filter='url(#n)'{extra}/>")


def tiled(W, H, body):
    """O desenho em <g id='t'>, repetido nas oito vizinhas: o que passa da beirada volta do outro lado."""
    uses = ''.join(f"<use href='#t' x='{dx}' y='{dy}'/>" for dx in (-W, 0, W) for dy in (-H, 0, H) if dx or dy)
    return f"<g id='t'>{body}</g>{uses}"


sizes = {}

# ===== As oito primeiras: o mesmo desenho, agora em arquivo =====
for name, uri in [('planta', blue), ('lousa', chalk), ('lousa-2', chalk_dust), ('jeans', seam), ('jeans-2', denim_slub),
                  ('estrelas', sky), ('estrelas-2', dust), ('tijolo', brick), ('nogueira', floor), ('nogueira-2', wood_grain)]:
    sizes[name] = save(name, raw(uri))

# ===== Feltro de sinuca: a lã verde, a fibra fina e as manchas do pano =====
sizes['feltro'] = save('feltro', f"""<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'>
<filter id='a' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='2' stitchTiles='stitch'/>
<feColorMatrix values='0 0 0 0 .75 0 0 0 0 1 0 0 0 0 .8 0 0 0 .16 0'/></filter>
<filter id='b' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.025' numOctaves='3' seed='6' stitchTiles='stitch'/>
<feColorMatrix values='0 0 0 0 0 0 0 0 0 .05 0 0 0 0 .02 0 0 0 .9 -.35'/></filter>
<rect width='320' height='320' filter='url(#b)'/><rect width='320' height='320' filter='url(#a)'/>
</svg>""")

# ===== Azulejo: o azulejo azul de noite, com a flor no meio e os quartos de círculo nos cantos =====
A = 120
flower = ''.join(f"<ellipse cx='60' cy='{60 - 19}' rx='8' ry='15' transform='rotate({a} 60 60)'/>" for a in range(0, 360, 45))
corner = ''.join(f"<circle cx='{x}' cy='{y}' r='26'/><circle cx='{x}' cy='{y}' r='16'/>" for x in (0, A) for y in (0, A))
sizes['azulejo'] = save('azulejo', f"""<svg xmlns='http://www.w3.org/2000/svg' width='{A}' height='{A}'>
<defs><linearGradient id='v' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.07'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.12'/></linearGradient></defs>
<rect width='{A}' height='{A}' fill='#122a52'/>
<g fill='none' stroke='#5b8fd6' stroke-opacity='.5' stroke-width='2.2'>
<path d='M60 14 106 60 60 106 14 60z'/>{corner}
</g>
<g fill='#5b8fd6' fill-opacity='.32'>{flower}</g>
<circle cx='60' cy='60' r='6' fill='#c9a24a' fill-opacity='.7'/>
<rect width='{A}' height='{A}' fill='url(#v)'/>
<rect width='{A}' height='2' fill='#060d1a' fill-opacity='.85'/><rect width='2' height='{A}' fill='#060d1a' fill-opacity='.85'/>
</svg>""")

# ===== Capitonê: o couro do sofá, as almofadinhas em losango e os botões =====
C = 96
h = C // 2
# uma de cada (as outras são as mesmas, deslocadas um ladrilho: tiled() repete)
cushions = ''.join(f"<circle cx='{x}' cy='{y}' r='{h}' fill='url(#c)'/>" for x, y in [(h, 0), (0, h)])
creases = (f"<path d='M0 0L{C} {C}M{C} 0L0 {C}' stroke='#000' stroke-opacity='.45' stroke-width='5'/>"
           f"<path d='M0 0L{C} {C}M{C} 0L0 {C}' stroke='#000' stroke-opacity='.6' stroke-width='1.6'/>"
           f"<path d='M0 1.6L{C} {C + 1.6}M{C} 1.6L0 {C + 1.6}' stroke='#ffb090' stroke-opacity='.08' stroke-width='1'/>")
buttons = ''.join(
    f"<circle cx='{x}' cy='{y}' r='9' fill='#000' fill-opacity='.35'/><circle cx='{x}' cy='{y}' r='4.5' fill='#2a0d09'/>"
    f"<circle cx='{x - 1.2}' cy='{y - 1.4}' r='1.6' fill='#ffcfb5' fill-opacity='.25'/>" for x, y in [(0, 0), (h, h)])
sizes['capitone'] = save('capitone', f"""<svg xmlns='http://www.w3.org/2000/svg' width='{C}' height='{C}'>
<defs><radialGradient id='c'><stop offset='0' stop-color='#ffb38f' stop-opacity='.16'/><stop offset='.55' stop-color='#ffb38f' stop-opacity='.05'/><stop offset='1' stop-color='#000' stop-opacity='.25'/></radialGradient></defs>
{tiled(C, C, cushions + creases + buttons)}
</svg>""")

# ===== Terminal: o fósforo verde, as linhas de código apagadas =====
lines = [
    '&gt; abrindo o mural...', 'carregando fichas [##########] 100%', '', 'for jogo in backlog:', '    if jogo.nota &gt;= 9:',
    "        pregar(jogo, 'tachinha')", '', '&gt; meu_mural --perfil', 'OK  6 murais, 0 erros', '',
    'nota_final = media(fichas)', '&gt; zerar --todos', 'erro: tempo insuficiente', '&gt; _',
]
T_W, T_H, LH = 560, 14 * 24, 24
text = ''.join(f"<text x='18' y='{LH * (i + 1) - 7}'>{l}</text>" for i, l in enumerate(lines) if l)
sizes['terminal'] = save('terminal', f"""<svg xmlns='http://www.w3.org/2000/svg' width='{T_W}' height='{T_H}'>
<g fill='#5cff8f' fill-opacity='.2' font-family='Consolas, Menlo, monospace' font-size='13' xml:space='preserve'>{text}</g>
</svg>""")

# ===== Mapa topográfico: as curvas de nível de um relevo que dá a volta no ladrilho =====
M = 480
rnd = random.Random(11)
waves = [(rnd.choice([1, 2, 2, 3]), rnd.choice([-2, -1, 1, 2]), rnd.uniform(0, 6.28), rnd.uniform(.5, 1)) for _ in range(5)]
waves += [(rnd.choice([0, 1]), rnd.choice([1, 3]), rnd.uniform(0, 6.28), rnd.uniform(.3, .6)) for _ in range(2)]


def relevo(x, y):
    return sum(a * math.sin(2 * math.pi * (k * x + l * y) / M + p) for k, l, p, a in waves)


STEP = 8
N = M // STEP
grid = [[relevo(i * STEP, j * STEP) for i in range(N + 1)] for j in range(N + 1)]
lo = min(min(r) for r in grid)
hi = max(max(r) for r in grid)
levels = [lo + (hi - lo) * (t + .5) / 22 for t in range(22)]


def contour(level):
    segs = []
    for j in range(N):
        for i in range(N):
            v = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
            pts = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            cross = []
            for e in range(4):
                a, b = v[e], v[(e + 1) % 4]
                if (a < level) != (b < level):
                    t = (level - a) / (b - a)
                    (x1, y1), (x2, y2) = pts[e], pts[(e + 1) % 4]
                    cross.append((round((x1 + (x2 - x1) * t) * STEP), round((y1 + (y2 - y1) * t) * STEP)))
            if len(cross) == 2:
                segs.append(tuple(cross))
            elif len(cross) == 4:
                segs += [(cross[0], cross[1]), (cross[2], cross[3])]
    # junta os pedacinhos em linhas
    ends = {}
    for s in segs:
        for p in s:
            ends.setdefault(p, []).append(s)
    used, paths = set(), []
    for s in segs:
        if s in used:
            continue
        used.add(s)
        line = [s[0], s[1]]
        for direction in (1, 0):
            while True:
                tip = line[-1] if direction else line[0]
                nxt = next((o for o in ends.get(tip, []) if o not in used), None)
                if not nxt:
                    break
                used.add(nxt)
                q = nxt[1] if nxt[0] == tip else nxt[0]
                if direction:
                    line.append(q)
                else:
                    line.insert(0, q)
        paths.append('M' + 'L'.join(f'{x:g} {y:g}' for x, y in line))
    return ''.join(paths)


thin = ''.join(contour(l) for n, l in enumerate(levels) if n % 5)
thick = ''.join(contour(l) for n, l in enumerate(levels) if not n % 5)
sizes['topografia'] = save('topografia', f"""<svg xmlns='http://www.w3.org/2000/svg' width='{M}' height='{M}' fill='none' stroke-linejoin='round'>
<path d='{thin}' stroke='#c9d6a3' stroke-opacity='.17' stroke-width='1'/>
<path d='{thick}' stroke='#d8e2b5' stroke-opacity='.3' stroke-width='1.6'/>
</svg>""")

# ===== Concreto aparente: a placa da fôrma, os furos dos tirantes e as manchas da massa =====
CW, CH = 360, 240
holes = ''.join(
    f"<circle cx='{x}' cy='{y + 1}' r='6.5' fill='#fff' fill-opacity='.05'/><circle cx='{x}' cy='{y}' r='6' fill='#0d0d0c' fill-opacity='.8'/>"
    f"<circle cx='{x}' cy='{y}' r='3' fill='#000' fill-opacity='.5'/>" for x in (60, 180, 300) for y in (60, 180))
sizes['concreto'] = save('concreto', f"""<svg xmlns='http://www.w3.org/2000/svg' width='{CW}' height='{CH}'>
<filter id='m' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='4' seed='4' stitchTiles='stitch'/>
<feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .48 0 0 0 .55 -.24'/></filter>
<filter id='p' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='2' seed='9' stitchTiles='stitch'/>
<feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.2 1.25'/></filter>
<rect width='{CW}' height='{CH}' filter='url(#m)'/><rect width='{CW}' height='{CH}' filter='url(#p)' opacity='.5'/>
{holes}
<rect width='{CW}' height='2' fill='#000' fill-opacity='.55'/><rect y='2' width='{CW}' height='1' fill='#fff' fill-opacity='.05'/>
<rect width='2' height='{CH}' fill='#000' fill-opacity='.5'/><rect x='2' width='1' height='{CH}' fill='#fff' fill-opacity='.04'/>
</svg>""")

# ===== Placa de circuito: as trilhas de cobre a 45 graus, as ilhas, os furos e um chip =====
P = 320
G = 16
rnd = random.Random(5)
dirs = [(1, 0), (0, 1), (-1, 0), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
traces, pads = [], []
while len(traces) < 26:
    x, y = rnd.randrange(0, P // G) * G, rnd.randrange(0, P // G) * G
    d = rnd.choice(dirs[:4])
    pts = [(x, y)]
    for _ in range(rnd.randint(2, 4)):
        n = rnd.randint(2, 6)
        x, y = x + d[0] * G * n, y + d[1] * G * n
        pts.append((x, y))
        # vira 45 graus para um lado ou para o outro
        k = dirs.index(d)
        turn = {0: [4, 5], 1: [4, 6], 2: [6, 7], 3: [5, 7], 4: [0, 1], 5: [0, 3], 6: [1, 2], 7: [2, 3]}[k]
        d = dirs[rnd.choice(turn)]
    # a trilha não passa de um ladrilho para fora (tiled() só repete nas vizinhas)
    if not all(-P < a < 2 * P and -P < b < 2 * P for a, b in pts):
        continue
    traces.append('M' + 'L'.join(f'{a} {b}' for a, b in pts))
    for a, b in (pts[0], pts[-1]):
        pads.append(f"<circle cx='{a}' cy='{b}' r='4.5'/>")
chip = ("<rect x='122' y='138' width='76' height='44' rx='3' fill='#0d0f0e' fill-opacity='.85'/>"
        + ''.join(f"<rect x='{128 + i * 10}' y='131' width='4' height='7' fill='#b9934f' fill-opacity='.45'/>"
                  f"<rect x='{128 + i * 10}' y='182' width='4' height='7' fill='#b9934f' fill-opacity='.45'/>" for i in range(7))
        + "<circle cx='130' cy='146' r='2.5' fill='#fff' fill-opacity='.12'/>")
sizes['circuito'] = save('circuito', f"""<svg xmlns='http://www.w3.org/2000/svg' width='{P}' height='{P}'>
{tiled(P, P, f"<path d='{''.join(traces)}' fill='none' stroke='#c99a4e' stroke-opacity='.3' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/><g fill='#d6aa5c' fill-opacity='.35'>{''.join(pads)}</g><g fill='#06140d'>{''.join(p.replace(chr(39) + '4.5' + chr(39), chr(39) + '1.8' + chr(39)) for p in pads)}</g>{chip}")}
</svg>""")

# ===== Discos de vinil: os discos pretos com os sulcos e o selo colorido, espalhados =====
V = 440
R = 74
rnd = random.Random(8)
spots = []
for _ in range(20000):
    if len(spots) == 5:
        break
    x, y = rnd.uniform(0, V), rnd.uniform(0, V)
    ok = all(math.hypot(min(abs(x - a), V - abs(x - a)), min(abs(y - b), V - abs(y - b))) > 2 * R + 16 for a, b in spots)
    if ok:
        spots.append((x, y))
labels = ['#c8463b', '#d9a441', '#3f8f86', '#d46a9a', '#e8dcc0']
grooves = ''.join(f"<circle r='{r}'/>" for r in range(28, R - 2, 3))
record = (f"<g id='d'><circle r='{R}' fill='#080808'/><g fill='none' stroke='#fff' stroke-opacity='.05' stroke-width='1'>{grooves}</g>"
          f"<path d='M{-R * .7:.0f} {-R * .7:.0f}A{R} {R} 0 0 1 {R * .7:.0f} {-R * .7:.0f}L0 0z' fill='#fff' fill-opacity='.035'/>"
          f"<path d='M{-R * .7:.0f} {R * .7:.0f}A{R} {R} 0 0 0 {R * .7:.0f} {R * .7:.0f}L0 0z' fill='#fff' fill-opacity='.025'/></g>")
discs = ''.join(
    f"<g transform='translate({x:.0f} {y:.0f}) rotate({rnd.randint(0, 359)})'><use href='#d'/><circle r='22' fill='{labels[i]}' fill-opacity='.55'/>"
    f"<path d='M-14 -6h28M-10 2h20' stroke='#000' stroke-opacity='.3' stroke-width='2'/><circle r='3' fill='#141416'/></g>"
    for i, (x, y) in enumerate(spots))
sizes['vinil'] = save('vinil', f"""<svg xmlns='http://www.w3.org/2000/svg' width='{V}' height='{V}'>
<defs>{record}</defs>{tiled(V, V, discs)}
</svg>""")

# ===== Ondas (seigaiha): as escamas de ondas japonesas, uma fileira por cima da outra =====
SW, SH, SR = 80, 40, 40
rows_svg = ''
for k, cy in enumerate(range(-40, 80, 20)):
    x0 = 40 if (cy // 20) % 2 else 0
    for cx in range(x0 - SW, SW + 41, SW):
        rows_svg += f"<use href='#e' x='{cx}' y='{cy}'/>"
scale = (f"<g id='e'><circle r='{SR}' fill='#0f1f3d'/><g fill='none' stroke='#2b4f8a' stroke-width='3'>"
         f"<circle r='34' stroke-opacity='.75'/><circle r='26' stroke-opacity='.55'/><circle r='18' stroke-opacity='.4'/></g>"
         f"<circle r='10' fill='#2b4f8a' fill-opacity='.3'/>"
         f"<circle r='{SR - .8}' fill='none' stroke='#9fbbe6' stroke-opacity='.25' stroke-width='1.4'/></g>")
sizes['ondas'] = save('ondas', f"<svg xmlns='http://www.w3.org/2000/svg' width='{SW}' height='{SH}'><defs>{scale}</defs>{rows_svg}</svg>")

print({k: v for k, v in sizes.items()})

# ===== O CSS =====
LIGHT = "radial-gradient(ellipse 110% 70% at 50% -10%, {c}, transparent 70%)"
VIG = "radial-gradient(ellipse at center, transparent {s}%, {c})"
css = f"""
/* As paredes (ver PAGE_BACKGROUNDS em core/profile.ts): atrás do site inteiro, do perfil e da prévia
   nas Configurações. Todas escuras, para o giz, as fitas e os títulos da parede lerem bem. Quem inclui
   escolhe pelo data-parede. Os desenhos grandes ficam em public/paredes/<id>.svg (e <id>-2.svg), que
   ui/page-wall põe em --arte e --arte-2: só a parede escolhida é baixada. Todos os ladrilhos emendam
   sem marca (o que passa da beirada volta do outro lado; o ruído tem a região do filtro do tamanho
   do ladrilho). Gerado por um script: mexer nos números à mão é seguro, nos desenhos não. */
@mixin paredes {{
  /* a fibra e a tinta irregular, a mesma em várias (fica numa variável para não repetir o desenho) */
  --grao-parede: {fine_white};

  /* Eucatex grafite: a parede do site, com os furos */
  &[data-parede='eucatex'] {{
    background-color: #1f1c1a;
    background-image:
      radial-gradient(ellipse 90% 55% at 50% -8%, rgb(255 246 230 / 0.11), transparent 70%),
      radial-gradient(circle at 50% 44%, var(--wall-hole) 0 3.1px, transparent 3.6px),
      radial-gradient(circle at 50% 56%, rgb(255 255 255 / 0.07) 0 3.4px, transparent 4px),
      var(--grao-parede);
    background-size: 100% 900px, 26px 26px, 26px 26px, 300px 300px;
    background-position: 0 0, 13px 13px, 13px 13px, 0 0;
    background-repeat: no-repeat, repeat, repeat, repeat;
  }}

  /* Planta azul: o papel de cópia heliográfica, a grade fina e a grossa, e os desenhos a lápis branco */
  &[data-parede='planta'] {{
    background-color: #12386a;
    background-image:
      radial-gradient(ellipse 110% 70% at 50% -10%, rgb(130 185 255 / 0.18), transparent 70%),
      radial-gradient(ellipse at center, transparent 55%, rgb(2 14 38 / 0.5)),
      var(--arte),
      linear-gradient(rgb(220 235 255 / 0.15) 1px, transparent 1px),
      linear-gradient(90deg, rgb(220 235 255 / 0.15) 1px, transparent 1px),
      linear-gradient(rgb(220 235 255 / 0.065) 1px, transparent 1px),
      linear-gradient(90deg, rgb(220 235 255 / 0.065) 1px, transparent 1px),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, 960px 960px, 120px 120px, 120px 120px, 24px 24px, 24px 24px, 300px 300px;
    background-position: 0 0, 0 0, 40px 30px, -1px -1px, -1px -1px, -1px -1px, -1px -1px, 0 0;
    background-repeat: no-repeat, no-repeat, repeat, repeat, repeat, repeat, repeat, repeat;
  }}

  /* Lousa: o verde-escuro do quadro-negro, as passadas do apagador e o pó de giz */
  &[data-parede='lousa'] {{
    background-color: #21322a;
    background-image:
      radial-gradient(ellipse 110% 70% at 50% -10%, rgb(235 255 240 / 0.09), transparent 70%),
      radial-gradient(ellipse at center, transparent 50%, rgb(5 14 10 / 0.5)),
      var(--arte),
      var(--arte-2);
    background-size: 100% 100%, 100% 100%, 1100px 800px, 240px 240px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Jeans: a sarja índigo em diagonal, os fios mais claros e a costura dupla em linha laranja */
  &[data-parede='jeans'] {{
    background-color: #1e2d4f;
    background-image:
      radial-gradient(ellipse 110% 70% at 50% -10%, rgb(200 220 255 / 0.12), transparent 70%),
      radial-gradient(ellipse at center, transparent 50%, rgb(6 12 28 / 0.5)),
      var(--arte),
      repeating-linear-gradient(-55deg, rgb(255 255 255 / 0.055) 0 1px, transparent 1px 3.5px),
      repeating-linear-gradient(35deg, rgb(0 0 0 / 0.16) 0 1px, transparent 1px 4px),
      var(--arte-2);
    background-size: 100% 100%, 100% 100%, 624px 624px, auto, auto, 320px 320px;
    background-repeat: no-repeat, no-repeat, repeat, repeat, repeat, repeat;
  }}

  /* Veludo de cinema: a cortina vermelha com as dobras, e a luz do palco caindo de cima */
  &[data-parede='veludo'] {{
    background-color: #3c0d15;
    background-image:
      radial-gradient(ellipse 70% 50% at 50% -8%, rgb(255 196 150 / 0.2), transparent 70%),
      linear-gradient(transparent 65%, rgb(10 0 2 / 0.45)),
      repeating-linear-gradient(90deg, rgb(10 0 2 / 0.42) 0, rgb(255 110 120 / 0.08) 40px, rgb(10 0 2 / 0.42) 92px),
      repeating-linear-gradient(90deg, transparent 0, rgb(255 230 230 / 0.04) 67px, transparent 141px),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, auto, auto, 300px 300px;
    background-repeat: no-repeat, no-repeat, repeat, repeat, repeat;
  }}

  /* Céu de planetário: o azul da noite, duas nebulosas, as estrelas e uma constelação tracejada */
  &[data-parede='estrelas'] {{
    background-color: #0b1029;
    background-image:
      radial-gradient(ellipse 55% 40% at 78% 18%, rgb(140 92 220 / 0.2), transparent 70%),
      radial-gradient(ellipse 50% 38% at 12% 78%, rgb(50 120 210 / 0.16), transparent 70%),
      var(--arte),
      var(--arte-2);
    background-size: 100% 100%, 100% 100%, 700px 700px, 230px 230px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Tijolinho: a parede de tijolo à vista, pintada de escuro, com o rejunte fundo */
  &[data-parede='tijolo'] {{
    background-color: #1a1210;
    background-image:
      radial-gradient(ellipse 100% 65% at 50% -10%, rgb(255 210 170 / 0.13), transparent 70%),
      radial-gradient(ellipse at center, transparent 50%, rgb(10 4 2 / 0.55)),
      linear-gradient(rgb(20 12 10 / 0.25), rgb(20 12 10 / 0.25)),
      var(--grao-parede),
      var(--arte);
    background-size: 100% 100%, 100% 100%, auto, 300px 300px, {tw}px {th}px;
    background-repeat: no-repeat, no-repeat, repeat, repeat, repeat;
  }}

  /* Assoalho de nogueira: as tábuas deitadas, o veio da madeira e as emendas desencontradas */
  &[data-parede='nogueira'] {{
    background-color: #33221a;
    background-image:
      radial-gradient(ellipse 100% 65% at 50% -10%, rgb(255 220 180 / 0.12), transparent 70%),
      radial-gradient(ellipse at center, transparent 50%, rgb(12 6 2 / 0.5)),
      var(--arte),
      var(--arte-2);
    background-size: 100% 100%, 100% 100%, 600px {rows * ph}px, 600px 600px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Caderno pontilhado: a folha preta do bullet journal, com a grade de pontinhos */
  &[data-parede='pontilhado'] {{
    background-color: #19191b;
    background-image:
      {LIGHT.format(c='rgb(255 250 240 / 0.08)')},
      {VIG.format(s=55, c='rgb(0 0 0 / 0.45)')},
      radial-gradient(circle, rgb(240 236 225 / 0.24) 0 1.2px, transparent 1.7px),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, 22px 22px, 300px 300px;
    background-position: 0 0, 0 0, 11px 11px, 0 0;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Feltro de sinuca: o pano verde da mesa e a luz da luminária baixa no meio */
  &[data-parede='feltro'] {{
    background-color: #0f4a31;
    background-image:
      radial-gradient(ellipse 75% 55% at 50% 25%, rgb(150 235 170 / 0.16), transparent 70%),
      {VIG.format(s=40, c='rgb(0 12 5 / 0.65)')},
      var(--arte);
    background-size: 100% 100%, 100% 100%, 320px 320px;
    background-repeat: no-repeat, no-repeat, repeat;
  }}

  /* Azulejo: o azul de noite, a flor no meio de cada um e os círculos que se formam nos cantos */
  &[data-parede='azulejo'] {{
    background-color: #122a52;
    background-image:
      {LIGHT.format(c='rgb(190 215 255 / 0.12)')},
      {VIG.format(s=45, c='rgb(3 8 20 / 0.6)')},
      var(--arte);
    background-size: 100% 100%, 100% 100%, 120px 120px;
    background-repeat: no-repeat, no-repeat, repeat;
  }}

  /* Capitonê: o couro cor de vinho do sofá, as almofadinhas em losango e os botões afundados */
  &[data-parede='capitone'] {{
    background-color: #43160f;
    background-image:
      {LIGHT.format(c='rgb(255 200 170 / 0.12)')},
      {VIG.format(s=45, c='rgb(15 3 1 / 0.6)')},
      var(--arte),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, 96px 96px, 300px 300px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Terminal: a tela de fósforo verde, as linhas de varredura e o código apagado */
  &[data-parede='terminal'] {{
    background-color: #040b06;
    background-image:
      radial-gradient(ellipse 80% 70% at 50% 40%, rgb(60 255 130 / 0.08), transparent 70%),
      {VIG.format(s=50, c='rgb(0 0 0 / 0.6)')},
      repeating-linear-gradient(rgb(0 0 0 / 0.4) 0 1px, transparent 1px 3px),
      var(--arte);
    background-size: 100% 100%, 100% 100%, auto, {T_W}px {T_H}px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Mapa topográfico: as curvas de nível finas, de cinco em cinco uma mais forte, e a grade do mapa */
  &[data-parede='topografia'] {{
    background-color: #18211b;
    background-image:
      {LIGHT.format(c='rgb(220 235 200 / 0.08)')},
      {VIG.format(s=50, c='rgb(2 6 3 / 0.55)')},
      var(--arte),
      linear-gradient(rgb(220 235 200 / 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgb(220 235 200 / 0.06) 1px, transparent 1px),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, {M}px {M}px, 160px 160px, 160px 160px, 300px 300px;
    background-repeat: no-repeat, no-repeat, repeat, repeat, repeat, repeat;
  }}

  /* Flanela xadrez: o xadrez vermelho e preto da camisa de lenhador, com o fio mostarda */
  &[data-parede='xadrez'] {{
    background-color: #3a1214;
    background-image:
      {LIGHT.format(c='rgb(255 210 190 / 0.1)')},
      {VIG.format(s=45, c='rgb(10 2 2 / 0.55)')},
      repeating-linear-gradient(90deg, transparent 0 57px, rgb(220 170 80 / 0.2) 57px 59px, transparent 59px 80px),
      repeating-linear-gradient(transparent 0 57px, rgb(220 170 80 / 0.2) 57px 59px, transparent 59px 80px),
      repeating-linear-gradient(90deg, rgb(8 2 2 / 0.5) 0 40px, transparent 40px 80px),
      repeating-linear-gradient(rgb(8 2 2 / 0.5) 0 40px, transparent 40px 80px),
      repeating-linear-gradient(45deg, rgb(255 255 255 / 0.03) 0 1px, transparent 1px 4px),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, auto, auto, auto, auto, auto, 300px 300px;
    background-repeat: no-repeat, no-repeat, repeat, repeat, repeat, repeat, repeat, repeat;
  }}

  /* Concreto aparente: as placas da fôrma, os furos dos tirantes e as manchas da massa */
  &[data-parede='concreto'] {{
    background-color: #2b2b29;
    background-image:
      {LIGHT.format(c='rgb(255 250 240 / 0.1)')},
      {VIG.format(s=45, c='rgb(0 0 0 / 0.55)')},
      var(--arte),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, {CW}px {CH}px, 300px 300px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Placa de circuito: o verde da placa, as trilhas de cobre, as ilhas furadas e um chip */
  &[data-parede='circuito'] {{
    background-color: #0c2a1c;
    background-image:
      {LIGHT.format(c='rgb(150 255 200 / 0.08)')},
      {VIG.format(s=45, c='rgb(0 8 4 / 0.6)')},
      var(--arte),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, {P}px {P}px, 300px 300px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Discos de vinil: os discos pretos espalhados, com os sulcos e o selo colorido */
  &[data-parede='vinil'] {{
    background-color: #17161a;
    background-image:
      {LIGHT.format(c='rgb(255 240 220 / 0.09)')},
      {VIG.format(s=45, c='rgb(0 0 0 / 0.55)')},
      var(--arte),
      var(--grao-parede);
    background-size: 100% 100%, 100% 100%, {V}px {V}px, 300px 300px;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
  }}

  /* Ondas: as escamas de ondas japonesas (seigaiha) em azul de noite */
  &[data-parede='ondas'] {{
    background-color: #0f1f3d;
    background-image:
      {LIGHT.format(c='rgb(190 215 255 / 0.1)')},
      {VIG.format(s=45, c='rgb(2 6 16 / 0.6)')},
      var(--arte);
    background-size: 100% 100%, 100% 100%, {SW}px {SH}px;
    background-repeat: no-repeat, no-repeat, repeat;
  }}

  /* Poá: o tecido vinho de bolinhas creme, com a trama aparecendo */
  &[data-parede='poa'] {{
    background-color: #3b1122;
    background-image:
      {LIGHT.format(c='rgb(255 215 230 / 0.1)')},
      {VIG.format(s=45, c='rgb(12 2 6 / 0.55)')},
      radial-gradient(circle, rgb(236 222 195 / 0.5) 0 4.5px, transparent 5px),
      radial-gradient(circle, rgb(236 222 195 / 0.5) 0 4.5px, transparent 5px),
      repeating-linear-gradient(90deg, rgb(255 255 255 / 0.035) 0 1px, transparent 1px 3px),
      repeating-linear-gradient(rgb(0 0 0 / 0.12) 0 1px, transparent 1px 3px);
    background-size: 100% 100%, 100% 100%, 36px 36px, 36px 36px, auto, auto;
    background-position: 0 0, 0 0, 0 0, 18px 18px, 0 0, 0 0;
    background-repeat: no-repeat, no-repeat, repeat, repeat, repeat, repeat;
  }}
}}
"""
p = os.path.join(ROOT, 'src', 'app', 'ui', '_profile-materials.scss')
s = open(p, encoding='utf-8').read()
marker = '\n/* As paredes '
s = s[:s.index(marker)] if marker in s else s
s = s.rstrip('\n') + '\n' + css
open(p, 'w', encoding='utf-8').write(s)
print('css', len(css))
