"""Monta a lista de palavras do cofre (projects/cofre/src/core/palavras.ts).

7.776 palavras comuns do português do Brasil que já se escrevem sem acento nem cedilha (nunca com o
acento arrancado), de 3 a 10 letras, para a frase sorteada da senha mestra (seção 8.3 e decisão 7 do
PLANO-COFRE.md). Rodar de novo com as mesmas fontes dá exatamente a mesma lista.

Fontes (baixar numa pasta e passar o caminho dela):
- pt_br_full.txt e pt_full.txt, do FrequencyWords (https://github.com/hermitdave/FrequencyWords,
  content/2018/), contagens de palavras nas legendas do OpenSubtitles do Brasil e de Portugal;
  licença CC-BY-SA 4.0. É delas que a lista deriva, então a lista também é CC-BY-SA 4.0. A de
  Portugal tira o que se usa muito mais lá do que aqui ("facto", "ficheiro", "autocarro").
- pt_PT.dic, pt_BR.dic e pt_BR.aff, os dicionários do LibreOffice
  (https://github.com/LibreOffice/dictionaries, pastas pt_PT/ e pt_BR/; o de Portugal é GPL, LGPL ou
  MPL, o VERO LGPLv3 ou MPL); só conferem. As palavras saem das entradas do de Portugal, que diz a
  classe de cada uma: substantivo, verbo, adjetivo…, nunca nome próprio. O VERO (expandido pelas
  regras de sufixo do .aff, porque ele guarda "casa" como forma de "casar") confere que a palavra
  existe no Brasil.
- pt, da List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
  (https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words); CC-BY 4.0;
  só tira palavras.
Mais scripts/cofre-palavras-fora.txt: o que a revisão à mão tirou (palavrões, ofensas, doenças,
morte, drogas, religião, política, nomes, termos técnicos e estrangeiros que passaram).

Uso: python -I scripts/cofre-palavras.py <pasta das fontes>
"""

import hashlib
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'projects' / 'cofre' / 'src' / 'core' / 'palavras.ts'
FORA = RAIZ / 'scripts' / 'cofre-palavras-fora.txt'
TAMANHO = 7776
CLASSES = {'nc', 'a_nc', 'v', 'adj', 'adv', 'card', 'nord'}

# as fontes exatas com que a lista foi feita (21/10/2026)
FONTES = {
    'pt_br_full.txt': '533b3abaab3b1ea9cec7a150fc8aaf8d428c6f241979cc2224b7ee82f8a369b2',
    'pt_full.txt': '21ac5ba5840001d522f2a7b91cc7cd0b25d24a8dcea3ecf997277662859b8f2f',
    'pt_BR.dic': 'a38bfb26b68ece2834e79fe83e48d5792652970ace12db89d1b9674bf9933183',
    'pt_BR.aff': '21d8ad2a769a60e17e2b5ea4ef11d4d593a58b9e2a82d642ef82d6a4c5523865',
    'pt_PT.dic': 'e29ba2d7aa8a2ad43e9cb46ac6473064b661545c87002aea90e18899d98d3cc9',
    'pt': '05ef524b0bb7f83f87257f6ec4dabf70e16b8bb6930f769fb93deaf608ff196d',
}


def sem_acento(p):
    return ''.join(c for c in unicodedata.normalize('NFD', p) if unicodedata.category(c) != 'Mn')


def formas_do_vero(dic, aff):
    """Todas as palavras que o VERO aceita, com as regras de sufixo aplicadas (sem as de prefixo).

    Devolve as formas em minúsculas e, à parte, as entradas com maiúscula (nomes próprios)."""
    regras = {}
    for linha in aff.splitlines():
        p = linha.split()
        # "SFX <marca> <tira> <põe>[/marcas] <condição>"; o cabeçalho de cada marca tem 4 partes
        if len(p) >= 5 and p[0] == 'SFX':
            tira = '' if p[2] == '0' else p[2]
            poe = p[3].split('/')[0]
            poe = '' if poe == '0' else poe
            regras.setdefault(p[1], []).append((tira, poe, re.compile(('' if p[4] == '.' else p[4]) + '$')))
    formas, proprios = set(), set()
    for linha in dic.splitlines()[1:]:
        palavra, _, marcas = linha.strip().partition('/')
        if palavra != palavra.lower():
            proprios.add(palavra.lower())
            continue
        formas.add(palavra)
        for marca in marcas.split()[0] if marcas else '':
            for tira, poe, condicao in regras.get(marca, ()):
                if palavra.endswith(tira) and condicao.search(palavra):
                    formas.add(palavra[: len(palavra) - len(tira)] + poe)
    return formas, proprios


def ler_fontes(pasta):
    for nome, hash_ in FONTES.items():
        conteudo = (pasta / nome).read_bytes()
        if hashlib.sha256(conteudo).hexdigest() != hash_:
            sys.exit(f'{nome}: não é a versão com que a lista foi feita')

    def contagens(nome):
        c = {}
        for linha in (pasta / nome).read_text('utf-8').splitlines():
            w, n = linha.split()
            c[w] = c.get(w, 0) + int(n)
        return c

    freq = contagens('pt_br_full.txt')
    portugues_pt = contagens('pt_full.txt')
    brasil, proprios = formas_do_vero((pasta / 'pt_BR.dic').read_text('utf-8-sig'), (pasta / 'pt_BR.aff').read_text('utf-8'))
    # o de Portugal traz a classe de cada palavra depois de um TAB: [CAT=nc] substantivo, [CAT=np] nome
    # próprio…; as formas flexionadas vêm com o lema antes ([$abrir$CAT=v…] em "abram") e não contam
    portugal = {}
    for linha in (pasta / 'pt_PT.dic').read_text('utf-8-sig').splitlines()[1:]:
        classe = re.search(r'	\[CAT=(\w+)', linha)
        portugal.setdefault(re.split(r'[/\t]', linha)[0].strip(), set()).add(classe.group(1) if classe else '')
    ruins = {sem_acento(l.strip().lower()) for l in (pasta / 'pt').read_text('utf-8').splitlines() if l.strip()}
    return freq, portugues_pt, brasil, proprios, portugal, ruins


def montar(freq, portugues_pt, brasil, proprios, portugal, ruins, fora):
    total_br = sum(freq.values())
    total_pt = sum(portugues_pt.values())

    def de_portugal(w):
        """Usada mais de 5 vezes mais nas legendas de Portugal que nas do Brasil (proporcionalmente)."""
        return (portugues_pt.get(w, 0) + 1) / total_pt > 5 * (freq.get(w, 0) + 1) / total_br

    # as entradas do dicionário de Portugal que são substantivo, verbo, adjetivo, advérbio ou número,
    # e nunca nome próprio
    comuns = {w for w, classes in portugal.items() if classes & CLASSES and 'np' not in classes}

    # a grafia mais usada de cada palavra, com ou sem acento: "esta" perde para "está"
    mais_usada = {}
    for w, n in freq.items():
        k = sem_acento(w)
        if k not in mais_usada or n > freq[mais_usada[k]]:
            mais_usada[k] = w

    def serve(w):
        return (
            re.fullmatch(r'[a-z]{3,10}', w)
            and w in freq
            and mais_usada[w] == w
            and w not in ruins
            and w not in fora
            and w not in proprios
            and not de_portugal(w)
            and w in brasil
            # o português termina em vogal ou em l, r, s, z, m, x
            and w[-1] in 'aeioulrszmx'
            and not re.search(r'[kwy]|sh|th|ck|ph|tt|ll|ff|pp|cc|mm|nn|dd|gg|bb|zz|oo|ee', w)
            # plural de uma palavra que já está na lista de entradas
            and not (w.endswith('s') and (w[:-1] in comuns or w[:-2] in comuns))
        )

    def pontos(w):
        """A palavra e as formas dela (plural, feminino) somadas, para a mais conhecida subir."""
        formas = {w, w + 's', w + 'es'}
        if w.endswith('o'):
            formas |= {w[:-1] + 'a', w[:-1] + 'os', w[:-1] + 'as'}
        if w.endswith('l'):
            formas.add(w[:-1] + 'is')
        if w.endswith('m'):
            formas.add(w[:-1] + 'ns')
        return sum(freq.get(f, 0) for f in formas)

    candidatas = sorted((w for w in comuns if serve(w)), key=lambda w: (-pontos(w), w))
    print(f'{len(candidatas)} candidatas')

    escolhidas = []
    vistas = set()
    for w in candidatas:
        # diminutivo de uma palavra que já entrou ("foquinha" depois de "foca")
        m = re.fullmatch(r'(.+?)z?inh([oa])', w)
        if m:
            raiz = re.sub(r'qu$', 'c', re.sub(r'gu$', 'g', m.group(1)))
            if {raiz + 'o', raiz + 'a', raiz} & vistas:
                continue
        escolhidas.append(w)
        vistas.add(w)
        if len(escolhidas) == TAMANHO:
            break
    if len(escolhidas) < TAMANHO:
        sys.exit(f'só {len(escolhidas)} palavras')
    return sorted(escolhidas), pontos(escolhidas[-1])


def main():
    pasta = Path(sys.argv[1])
    fora = {w for l in FORA.read_text('utf-8').splitlines() if not l.startswith('#') for w in l.split()}
    lista, ultima = montar(*ler_fontes(pasta), fora)
    linhas = []
    for i in range(0, len(lista), 12):
        linhas.append("  '" + ' '.join(lista[i:i + 12]) + "',")
    SAIDA.write_text(
        '/**\n'
        ' * A lista de palavras da frase sorteada (ver sorteio.ts): 7.776 palavras comuns do português do\n'
        ' * Brasil que já se escrevem sem acento nem cedilha, de 3 a 10 letras. Gerada por\n'
        ' * scripts/cofre-palavras.py; não editar à mão (para tirar uma palavra, ponha-a em\n'
        ' * scripts/cofre-palavras-fora.txt e rode o script de novo).\n'
        ' *\n'
        ' * Derivada das contagens do FrequencyWords (Hermit Dave, legendas do OpenSubtitles do Brasil e de\n'
        ' * Portugal), licença CC-BY-SA 4.0, e conferida nos dicionários do LibreOffice (o de Portugal e o\n'
        ' * VERO). Esta lista também é CC-BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/\n'
        ' */\n'
        'export const PALAVRAS: readonly string[] = [\n' + '\n'.join(linhas) + "\n].join(' ').split(' ');\n",
        encoding='utf-8',
        newline='\n',
    )
    print(f'{len(lista)} palavras; a menos comum com {ultima} ocorrências somadas')


if __name__ == '__main__':
    main()
