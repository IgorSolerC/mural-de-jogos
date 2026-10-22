// As regras de código do cofre (seções 10, 12 e 14 do PLANO-COFRE.md), conferidas a cada teste:
// nada que guarde no aparelho, monte HTML a partir de texto, rode texto como código ou escreva no
// console; nenhum import do Murall (src/app) e nenhuma dependência fora da lista.
// Roda com `node --test projects/cofre/regras.test.mjs` (está no `npm run test:ci`).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = join(raiz, 'src');
/** A pasta que o cofre divide com o Murall (o topo em dados e o desenho dele): a única coisa de fora que ele usa. */
const COMPARTILHADA = resolve(raiz, '..', '..', 'shared');
const arquivosCompartilhados = (ext) =>
  readdirSync(COMPARTILHADA, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(ext))
    .map((f) => join(COMPARTILHADA, f));

/** As únicas dependências que o cofre pode importar. Uma nova só com a aprovação do usuário. */
const PERMITIDAS = ['hash-wasm', '@angular/core', '@angular/common', '@angular/platform-browser', '@angular/router'];

const PROIBIDOS = [
  [/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write/, 'HTML montado de texto'],
  [/bypassSecurityTrust/, 'desligar a proteção do Angular'],
  [/\blocalStorage\b|\bindexedDB\b|document\.cookie|caches\.open/, 'guardar no aparelho'],
  [/serviceWorker\.register/, 'service worker'],
  [/\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]/, 'texto rodado como código'],
  [/\bconsole\.(log|info|debug|trace|dir|table)\b/, 'escrever no console'],
  [/addEventListener\s*\(\s*['"]message['"]|\bonmessage\s*=/, 'ouvir postMessage'],
];

function arquivos(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : /\.(ts|html|mjs|js)$/.test(e.name) ? [caminho] : [];
  });
}

/** O código sem os comentários, para uma palavra num comentário não contar. */
function semComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');
}

const todos = arquivos(fonte);

test('há código do cofre para conferir', () => {
  assert.ok(todos.some((f) => f.endsWith(`core${sep}crypto.ts`)), 'crypto.ts não encontrado');
});

test('nenhum uso proibido no código do cofre', () => {
  const achados = [];
  for (const f of todos) {
    const linhas = semComentarios(readFileSync(f, 'utf8')).split('\n');
    linhas.forEach((linha, i) => {
      for (const [padrao, oQue] of PROIBIDOS) {
        if (padrao.test(linha)) achados.push(`${relative(raiz, f)}:${i + 1}: ${oQue}`);
      }
    });
  }
  assert.deepEqual(achados, []);
});

test('o sessionStorage só no login do Google (a única exceção da seção 7.4)', () => {
  const achados = [];
  for (const f of todos) {
    if (f.endsWith(`core${sep}entrar.ts`) || f.endsWith('.spec.ts')) continue;
    if (/\bsessionStorage\b/.test(semComentarios(readFileSync(f, 'utf8')))) achados.push(relative(raiz, f));
  }
  assert.deepEqual(achados, []);
});

test('o cofre não importa nada de fora dele, e só as dependências permitidas', () => {
  const achados = [];
  const importa = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
  for (const f of todos) {
    for (const [, alvo] of semComentarios(readFileSync(f, 'utf8')).matchAll(importa)) {
      if (alvo.startsWith('.')) {
        const destino = resolve(dirname(f), alvo);
        // a única exceção: a lista das seções, só dados (o teste de baixo confere que ela não importa nada)
        if (destino.startsWith(COMPARTILHADA + sep)) continue;
        if (!destino.startsWith(fonte + sep)) achados.push(`${relative(raiz, f)}: importa ${alvo}, fora do cofre`);
      } else {
        const pacote = alvo.startsWith('@') ? alvo.split('/').slice(0, 2).join('/') : alvo.split('/')[0];
        if (!PERMITIDAS.includes(pacote)) achados.push(`${relative(raiz, f)}: importa ${alvo}, fora da lista`);
      }
    }
  }
  assert.deepEqual(achados, []);
});

test('o que o cofre divide com o Murall é só dados e desenho: nenhum import, nenhum endereço de fora', () => {
  const ts = arquivosCompartilhados('.ts');
  const scss = arquivosCompartilhados('.scss');
  assert.ok(ts.length >= 1 && scss.length >= 2);
  for (const f of ts) assert.equal(/\bimport\b|\brequire\s*\(/.test(semComentarios(readFileSync(f, 'utf8'))), false, f);
  // o desenho só usa @use dos arquivos da própria pasta, e nenhum url( que saia para outro endereço (só
  // data: e as fotos do próprio site, em textures/)
  for (const f of scss) {
    const texto = readFileSync(f, 'utf8');
    for (const [, alvo] of texto.matchAll(/@use \s+'([^']+)'/g)) assert.ok(resolve(dirname(f), alvo).startsWith(COMPARTILHADA + sep), `${f}: @use ${alvo}`);
    for (const [, alvo] of texto.matchAll(/url\(\s*['"]?([^'")]+)/g)) assert.ok(alvo.startsWith('data:') || alvo.startsWith('%23') || /^textures\/[a-z-]+\.png$/.test(alvo), `${f}: url(${alvo})`);
  }
});

test('os tokens do Murall no topo do cofre são os mesmos de src/styles.scss', () => {
  const murall = readFileSync(join(raiz, '..', '..', 'src', 'styles.scss'), 'utf8');
  const tokens = readFileSync(join(COMPARTILHADA, 'topo', '_tokens-do-murall.scss'), 'utf8');
  const linhas = [...tokens.matchAll(/^ {2}(--[a-z0-9-]+: .+;)$/gm)].map((m) => m[1]);
  assert.ok(linhas.length > 15);
  for (const l of linhas) assert.ok(murall.includes(l), `diferente do Murall: ${l}`);
});

test('a lista de palavras não tem nenhuma das que a revisão à mão tirou', () => {
  const fora = readFileSync(join(raiz, '..', '..', 'scripts', 'cofre-palavras-fora.txt'), 'utf8')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .flatMap((l) => l.split(/\s+/))
    .filter(Boolean);
  const lista = new Set([...readFileSync(join(fonte, 'core', 'palavras.ts'), 'utf8').matchAll(/^ {2}'([a-z ]+)',/gm)].flatMap((m) => m[1].split(' ')));
  assert.equal(lista.size, 7776);
  assert.deepEqual(fora.filter((w) => lista.has(w)), []);
});
