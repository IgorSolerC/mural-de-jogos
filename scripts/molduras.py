"""As molduras desenhadas (PROFILE_FRAMES em src/app/core/profile.ts com arte): cada uma é um SVG de 96x96
cortado em nove pedaços pelo border-image (fatia de 24: os quatro cantos de 24x24, e as beiradas de 48 que
se repetem ao longo de cada lado). Tudo o que fica nas beiradas tem período que divide 48, para as
repetições emendarem; o miolo (de 24 a 72) fica vazio. Os arquivos vão para public/molduras/<id>.svg.

Rodar da raiz do projeto: python scripts/molduras.py."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'public', 'molduras')
os.makedirs(OUT, exist_ok=True)

SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>{}</svg>"
# as quatro posições de um desenho feito no canto de cima à esquerda
MIRRORS = ['', "transform='matrix(-1 0 0 1 96 0)'", "transform='matrix(1 0 0 -1 0 96)'", "transform='matrix(-1 0 0 -1 96 96)'"]


def corners(id_):
    return ''.join(f"<use href='#{id_}' {m}/>" for m in MIRRORS)


def save(name, body):
    svg = ' '.join(SVG.format(body).split())
    open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8').write(svg)
    return len(svg)


sizes = {}

# ===== Bambu amarrado: um gomo em cada lado, o nó no meio de cada pedaço, e o barbante nos cantos =====
nodes_h = "<rect x='46.5' y='2' width='2' height='20' fill='#5b4f1b'/><rect x='48.5' y='2' width='1.5' height='20' fill='#f4e9ae' fill-opacity='.55'/>"
nodes_v = "<rect y='46.5' x='2' height='2' width='20' fill='#5b4f1b'/><rect y='48.5' x='2' height='1.5' width='20' fill='#f4e9ae' fill-opacity='.55'/>"
sizes['bambu'] = save('bambu', f"""
<defs>
<linearGradient id='h' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ead98f'/><stop offset='.3' stop-color='#cdb862'/><stop offset='.72' stop-color='#a38f3c'/><stop offset='1' stop-color='#6c5f22'/></linearGradient>
<linearGradient id='v' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ead98f'/><stop offset='.3' stop-color='#cdb862'/><stop offset='.72' stop-color='#a38f3c'/><stop offset='1' stop-color='#6c5f22'/></linearGradient>
<g id='amarra' fill='none' stroke='#7a5530' stroke-width='2.2' stroke-linecap='round'><path d='M3 9 15 21M7 5 19 17M3 15 9 21'/><path d='M3 9 15 21M7 5 19 17' stroke='#c99a62' stroke-width='.8' transform='translate(-.6 -.6)'/></g>
</defs>
<rect y='2' width='96' height='20' fill='url(#h)'/><rect y='74' width='96' height='20' fill='url(#h)'/>
{nodes_h}<g transform='translate(0 72)'>{nodes_h}</g>
<rect x='2' height='96' width='20' fill='url(#v)'/><rect x='74' height='96' width='20' fill='url(#v)'/>
{nodes_v}<g transform='translate(72 0)'>{nodes_v}</g>
{corners('amarra')}
""")

# ===== Corda náutica: a corda torcida dando a volta, as listras a 45 graus com passo de 6 =====
sizes['corda'] = save('corda', """
<defs><pattern id='p' width='4.2426' height='4.2426' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
<rect width='4.2426' height='4.2426' fill='#cfab70'/><rect width='1.6' height='4.2426' fill='#8d6b3b'/><rect x='1.6' width='.7' height='4.2426' fill='#ecd3a0'/></pattern></defs>
<rect x='12' y='12' width='72' height='72' rx='10' fill='none' stroke='#5e4320' stroke-width='23'/>
<rect x='12' y='12' width='72' height='72' rx='10' fill='none' stroke='url(#p)' stroke-width='20'/>
<rect x='5' y='5' width='86' height='86' rx='14' fill='none' stroke='#fff' stroke-opacity='.14' stroke-width='3'/>
<rect x='19' y='19' width='58' height='58' rx='5' fill='none' stroke='#000' stroke-opacity='.25' stroke-width='3'/>
""")

# ===== Película de cinema: o filme preto em cima da mesa de luz, os furinhos claros de 12 em 12 =====
holes = ''
for p in range(14, 96, 12):
    if p in (2,):
        continue
    for x, y in [(p + .5, 4), (p + .5, 85), (4, p + .5), (85, p + .5)]:
        # nos cantos, só os furos do próprio lado (sem o que cairia em cima do furo do outro)
        if (x < 12 or x > 84) and (y < 12 or y > 84):
            continue
        holes += f"<rect x='{x}' y='{y}' width='7' height='7' rx='1.6'/>"
sizes['filme'] = save('filme', f"""
<rect width='96' height='96' fill='#151515'/>
<g fill='#efe8d6'>{holes}</g>
<rect x='22.5' y='22.5' width='51' height='51' fill='none' stroke='#3a3a3a' stroke-width='1'/>
<rect width='96' height='96' fill='none' stroke='#2a2a2a' stroke-width='1'/>
""")

# ===== Selo postal: o papel branco do selo, o picote (meia bolinha a cada 8) e o fio impresso =====
bites = ''
for c in range(4, 96, 8):
    bites += f"<circle cx='{c}' cy='0' r='3.1'/><circle cx='{c}' cy='96' r='3.1'/><circle cx='0' cy='{c}' r='3.1'/><circle cx='96' cy='{c}' r='3.1'/>"
sizes['selo'] = save('selo', f"""
<defs><mask id='m'><rect width='96' height='96' fill='#fff'/><g fill='#000'>{bites}</g></mask></defs>
<rect width='96' height='96' fill='#f7f2e6' mask='url(#m)'/>
<rect x='14.5' y='14.5' width='67' height='67' fill='none' stroke='#b8433a' stroke-width='1.6'/>
<rect x='17.5' y='17.5' width='61' height='61' fill='none' stroke='#b8433a' stroke-opacity='.45' stroke-width='.8'/>
""")

# ===== Renda de crochê: os arquinhos para fora (de 12 em 12), duas fileiras de furinhos e a barra de dentro =====
scallops, lace_holes = '', ''
for c in range(6, 96, 12):
    scallops += f"<circle cx='{c}' cy='7' r='6'/><circle cx='{c}' cy='89' r='6'/><circle cx='7' cy='{c}' r='6'/><circle cx='89' cy='{c}' r='6'/>"
    lace_holes += (f"<circle cx='{c}' cy='7' r='2.2'/><circle cx='{c}' cy='89' r='2.2'/><circle cx='7' cy='{c}' r='2.2'/><circle cx='89' cy='{c}' r='2.2'/>")
for c in range(0, 97, 12):
    lace_holes += (f"<circle cx='{c}' cy='15' r='1.9'/><circle cx='{c}' cy='81' r='1.9'/><circle cx='15' cy='{c}' r='1.9'/><circle cx='81' cy='{c}' r='1.9'/>")
sizes['croche'] = save('croche', f"""
<defs><mask id='m'><rect width='96' height='96' fill='#000'/>
<g fill='#fff'><rect x='7' y='7' width='82' height='82'/>{scallops}</g>
<g fill='#000'>{lace_holes}</g>
<rect x='21' y='21' width='54' height='54' fill='none' stroke='#000' stroke-width='1.2'/></mask></defs>
<rect width='96' height='96' fill='#f4efe1' mask='url(#m)'/>
""")

# ===== Pixel 8-bit: a caixa de diálogo de jogo antigo, com os cantos em degrau =====
sizes['pixel'] = save('pixel', """
<g shape-rendering='crispEdges'>
<path d='M4 0h88v4h4v88h-4v4H4v-4H0V4h4z' fill='#0d0d20'/>
<path d='M8 4h80v4h4v80h-4v4H8v-4H4V8h4z' fill='#f4f4f4'/>
<rect x='8' y='8' width='80' height='80' fill='#9aa0c8'/>
<rect x='12' y='12' width='72' height='72' fill='#2b3fc4'/>
<rect x='12' y='12' width='72' height='4' fill='#5d70f0'/><rect x='12' y='12' width='4' height='72' fill='#5d70f0'/>
<rect x='12' y='80' width='72' height='4' fill='#1d2a8a'/><rect x='80' y='12' width='4' height='72' fill='#1d2a8a'/>
<rect x='20' y='20' width='56' height='56' fill='#0d0d20'/>
</g>
""")

print(sizes)
