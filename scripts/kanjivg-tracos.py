"""
Os traços do Dicionário Japonês (PLANO-DICIONARIO.md, a lousa): tira do KanjiVG (https://kanjivg.tagaini.net,
CC BY-SA 3.0, Ulrich Apel e colaboradores) só os caracteres das palavras do CSV (a palavra e a leitura) e grava
src/app/core/dictionary/strokes.ts: para cada caractere, os traços na ordem (o `d` de cada path, com uma casa
decimal) e onde fica o número de cada traço. A lousa importa o arquivo sob demanda (um pedaço
só dele), quando abre.

Uso: python -I scripts/kanjivg-tracos.py <kanjivg-AAAAMMDD-main.zip> <vocabulario-japones.csv> <saida.ts>
(o zip vem de https://github.com/KanjiVG/kanjivg/releases; o de 20260714 gerou o arquivo de hoje)
"""
import csv
import json
import re
import sys
import zipfile

zip_path, csv_path, out_path = sys.argv[1:4]
z = zipfile.ZipFile(zip_path)
names = set(z.namelist())

chars = set()
with open(csv_path, encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        for ch in row['japones'] + row['leitura']:
            if ord(ch) >= 0x3040:
                chars.add(ch)

def short(d):
    # uma casa decimal basta no quadro de 109: o traço não muda a olho e o arquivo encolhe
    return re.sub(r'-?\d+\.\d+', lambda m: ('%.1f' % float(m.group())).rstrip('0').rstrip('.'), d)

out = {}
missing = []
for ch in sorted(chars):
    name = 'kanji/%05x.svg' % ord(ch)
    if name not in names:
        missing.append(ch)
        continue
    svg = z.read(name).decode('utf-8')
    strokes = re.findall(r'<path id="kvg:[0-9a-f]+-s(\d+)"[^>]*? d="([^"]+)"', svg)
    strokes.sort(key=lambda s: int(s[0]))
    nums = re.findall(r'matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">(\d+)<', svg)
    nums.sort(key=lambda n: int(n[2]))
    out[ch] = {'s': [short(d) for _, d in strokes], 'n': [[round(float(x), 1), round(float(y), 1)] for x, y, _ in nums]}

HEAD = '''// Gerado por scripts/kanjivg-tracos.py: não edite à mão.
// Os traços vêm do KanjiVG (https://kanjivg.tagaini.net), de Ulrich Apel e colaboradores, sob a licença
// Creative Commons Atribuição-CompartilhaIgual 3.0 (CC BY-SA 3.0). Coordenadas no quadro de 109 por 109.

/** Para cada caractere: os traços na ordem (o `d` do SVG) e onde fica o número de cada um. */
export const STROKES: Record<string, { s: string[]; n: [number, number][] }> = '''
with open(out_path, 'w', encoding='utf-8', newline=chr(10)) as f:
    f.write(HEAD + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';' + chr(10))
print(len(out), 'caracteres; sem traços:', ' '.join('U+%04X' % ord(c) for c in missing))
