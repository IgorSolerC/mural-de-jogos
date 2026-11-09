// O que funciona no seu Murall funciona para quem visita (a regra "Visita: as mesmas peças do dono", no CLAUDE.md).
// A visita não tem cópia própria de nada: ela monta as mesmas peças do dono, e só o que é do dono (editar, estudar,
// as suas configurações) fica de fora. Este teste varre os moldes e falha:
//   1. se alguém desenhar à mão, fora da peça, o que uma peça compartilhada desenha (foi assim que a carta dos
//      Flashcards da visita parou de virar: a visita tinha uma parede só dela, que ficou para trás);
//   2. se uma peça que a visita monta passar a importar uma loja que escreve (o seu mural, os seus estudos, o
//      editor): elas só leem, pela fonte que quem usa dá (core/study-source.ts).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'src/app');

/**
 * As peças compartilhadas entre o dono e a visita: o arquivo da peça e as marcas do que ela desenha. Uma marca num
 * molde de fora da peça é uma cópia. Peça nova que a visita também mostra entra aqui.
 */
const PECAS = [
  {
    peca: 'src/app/ui/study-card-wall.html',
    usa: 'app-study-card-wall',
    marcas: [/<ul\b[^>]*class="cartas[\s"]/, /class="carta-btn"/],
    o: 'a parede de um baralho dos Flashcards (virar, maximizar, ler, o menu do flashcard)',
  },
  {
    peca: 'src/app/ui/study-piles.html',
    usa: 'app-study-piles',
    marcas: [/<a\b[^>]*class="pilha"/, /class="monte-cartas"/],
    o: 'as pilhas dos baralhos',
  },
  {
    peca: 'src/app/ui/study-group-tabs.html',
    usa: 'app-study-group-tabs',
    marcas: [/<nav\b[^>]*class="abas-grupos"/],
    o: 'as abas dos grupos dos Flashcards, com o "Mais"',
  },
];

/** Os moldes da visita e as peças que precisam aparecer neles. */
const VISITA = [
  { molde: 'src/app/ui/visit-study.html', pecas: ['app-study-card-wall', 'app-study-piles', 'app-study-group-tabs'] },
  { molde: 'src/app/pages/colleague-wall-page.html', pecas: ['app-wall-board', 'app-wall-toolbar', 'app-review-reader', 'app-visit-study'] },
];

/** As peças que a visita monta e que só leem: nada delas pode importar o que escreve. */
const SO_LEEM = [
  'src/app/ui/visit-study.ts',
  'src/app/ui/study-card-wall.ts',
  'src/app/ui/study-piles.ts',
  'src/app/ui/study-group-tabs.ts',
  'src/app/ui/study-card-back.ts',
  'src/app/ui/study-card-focus.ts',
];
/** O que escreve no seu Murall. */
const ESCREVE = /from '[./]+(?:core\/)?(study-store|review-store|desk|kanban-store|calendar-store|spending-store)'/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.(html|ts)$/.test(e.name) && !e.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const read = (path) => readFileSync(join(root, path), 'utf8');
/** O molde de um arquivo: o .html, ou o `template:` de um .ts. */
const templateOf = (path, text) => (path.endsWith('.html') ? text : (text.match(/template:\s*`([\s\S]*?)`/)?.[1] ?? ''));

test('nenhum molde desenha à mão o que uma peça compartilhada com a visita desenha', () => {
  const copias = [];
  for (const file of files(app)) {
    const path = relative(root, file).replaceAll('\\', '/');
    const molde = templateOf(path, readFileSync(file, 'utf8'));
    for (const p of PECAS) {
      if (path === p.peca) continue;
      if (p.marcas.some((m) => m.test(molde))) copias.push(`${path}: copia ${p.o}; use <${p.usa}> (${p.peca})`);
    }
  }
  assert.deepEqual(copias, [], 'A visita e o dono usam as mesmas peças (ver o CLAUDE.md, "Visita: as mesmas peças do dono").');
});

test('as peças compartilhadas ainda desenham o que dizem desenhar', () => {
  for (const p of PECAS) {
    const molde = read(p.peca);
    for (const m of p.marcas) assert.match(molde, m, `${p.peca} não desenha mais ${m}: atualize PECAS neste teste`);
  }
});

test('a visita monta as peças do dono', () => {
  for (const v of VISITA) {
    const molde = read(v.molde);
    for (const peca of v.pecas) assert.ok(molde.includes(`<${peca}`), `${v.molde} não monta <${peca}>: a visita tem de usar a mesma peça do dono`);
  }
});

test('as peças que a visita monta só leem: nenhuma importa o que escreve no seu Murall', () => {
  const erradas = SO_LEEM.flatMap((path) => {
    const hit = read(path).match(ESCREVE);
    return hit ? [`${path} importa ${hit[1]}`] : [];
  });
  assert.deepEqual(erradas, [], 'Leia pela fonte (core/study-source.ts, ou a vista do mural): o que só o dono faz fica na página do dono.');
});
