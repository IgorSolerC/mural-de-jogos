// Os botões que aparecem com a mão em cima de um card têm um padrão só, o do Fixar e do Finalizar do mural
// de anotações (src/app/ui/_etiqueta-acoes.scss; a regra está no CLAUDE.md). Este teste varre os estilos e
// falha se alguém revelar botões num card por conta própria, em vez de usar o et.mostra da peça única.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'src/app');

/**
 * O que aparece com a mão em cima sem ser um botão de ação de card: o arquivo, o trecho do seletor e o
 * porquê. Valem só naquele arquivo. Antes de pôr mais um aqui: se for um botão de ação sobre um card, ele
 * usa a peça única, sem exceção.
 */
const FORA_DO_PADRAO = [
  ['src/app/pages/kanban-page.scss', '.etiqueta-btn', 'o botão no cabeçalho da coluna do Kanban: a coluna não é um card'],
  ['src/app/ui/rich-text-codigo.scss', '.codigo-copiar', 'o Copiar do bloco de código, dentro do texto'],
  ['src/app/ui/wish-clip.ts', '.adesivo-btn', 'o lugar vazio do adesivo no recorte da Wishlist: é o próprio adesivo, não um botão de tinta'],
  ['src/app/ui/cover-picker.ts', '.foto', 'a capa escolhida no seletor de capas clareia'],
  ['src/app/ui/group-picker.scss', '.orelha', 'a orelha no seletor de grupos clareia'],
  ['src/app/ui/rich-text.ts', '.cartao-seta', 'a seta do card recolhível, dentro do texto'],
  ['src/app/ui/flashcard-preview.scss', 'lucide-icon', 'o desenho do próprio botão clareia'],
  ['src/app/pages/wall-board.scss', '.dobra', 'a dobra de abrir o grupo: faz parte da pasta'],
];

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.(scss|ts)$/.test(e.name) && !e.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Regras cujo seletor tem a mão num elemento e o estilo noutro, de dentro dele, que aparece (ou passa a pegar o toque). */
function revealsOnHover(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // em pedaços que acabam em { } ou ; (uma expressão regular só, nos arquivos grandes, levava minutos)
  const pieces = clean.split(/(?<=[{};])/);
  const found = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (!piece.endsWith('{') || !piece.includes(':hover')) continue;
    const selector = piece.slice(0, -1);
    if (!/:hover[^\s,{]*\s+[^\s,{]/.test(selector)) continue;
    // até o bloco fechar ou abrir outro; a última declaração pode vir sem ponto e vírgula, colada no }
    let end = i + 1;
    while (end < pieces.length && !pieces[end].endsWith('{') && !pieces[end].endsWith('}')) end++;
    let body = pieces.slice(i + 1, end).join('');
    if (pieces[end]?.endsWith('}')) body += pieces[end].slice(0, -1);
    if (!/opacity:\s*1\b|pointer-events:\s*auto|visibility:\s*visible/.test(body) && !body.includes('et.mostra')) continue;
    found.push({ selector: selector.trim().replace(/\s+/g, ' '), usesPiece: body.includes('et.mostra') });
  }
  return found;
}

test('nenhum card revela botões com a mão por conta própria: todos passam pela peça única', () => {
  const wrong = [];
  const used = new Set();
  for (const file of files(app)) {
    const path = relative(root, file).replaceAll('\\', '/');
    for (const rule of revealsOnHover(readFileSync(file, 'utf8'))) {
      if (rule.usesPiece) continue;
      const known = FORA_DO_PADRAO.find(([where, piece]) => where === path && rule.selector.includes(piece));
      if (known) {
        used.add(known);
        continue;
      }
      wrong.push(`${path}: ${rule.selector}`);
    }
  }
  assert.deepEqual(
    wrong,
    [],
    'Botões que aparecem com a mão em cima de um card usam src/app/ui/_etiqueta-acoes.scss (ver o CLAUDE.md). Se não for um botão de ação de card, ponha em FORA_DO_PADRAO, dizendo por quê.',
  );
  // a lista de fora não guarda sobra: uma exceção que ninguém usa só abriria brecha
  assert.deepEqual(
    FORA_DO_PADRAO.filter((entry) => !used.has(entry)).map(([where, piece]) => `${where}: ${piece}`),
    [],
    'FORA_DO_PADRAO com exceção que ninguém usa mais',
  );
});

test('os três cards de hoje usam a peça única, com o et.botao e o et.mostra', () => {
  for (const file of ['src/app/ui/review-card-acoes.scss', 'src/app/ui/kanban-note.scss', 'src/app/ui/study-card-wall.scss']) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.match(text, /@include et\.botao/, `${file} sem o et.botao`);
    assert.match(text, /@include et\.mostra/, `${file} sem o et.mostra`);
    assert.match(text, /@include et\.grupo/, `${file} sem o et.grupo`);
  }
});

test('todo componente feito com a ficha do mural leva as etiquetas dela', () => {
  const users = files(app).filter((file) => /template:\s*CARD_TEMPLATE/.test(readFileSync(file, 'utf8')));
  assert.ok(users.length >= 4, 'os componentes da ficha sumiram da busca');
  for (const file of users) {
    assert.match(readFileSync(file, 'utf8'), /styleUrl:\s*'\.\/review-card-acoes\.scss'/, `${relative(root, file)} sem o review-card-acoes.scss`);
  }
});

test('o estilo que vem de uma constante não usa o Sass: nos testes, ele não passa por lá', () => {
  const card = readFileSync(join(app, 'ui/review-card.ts'), 'utf8');
  assert.doesNotMatch(card, /@include|@use /);
});

test('a peça única guarda o padrão: separados, com sombra própria, e reagem à mão', () => {
  const piece = readFileSync(join(app, 'ui/_etiqueta-acoes.scss'), 'utf8');
  assert.match(piece, /gap: 4px/);
  assert.match(piece, /scale: 1\.06/);
  assert.match(piece, /background: var\(--etiqueta\)/);
  assert.match(piece, /0 1px 2px rgb\(0 0 0 \/ 0\.4\)/);
});

test('o verificador pega quem foge do padrão, e aceita quem usa a peça', () => {
  const own = revealsOnHover(`.card:hover .botao { opacity: 1; }`);
  assert.deepEqual(own, [{ selector: '.card:hover .botao', usesPiece: false }]);
  const host = revealsOnHover(`:host(:hover) .acoes { pointer-events: auto; }`);
  assert.equal(host.length, 1);
  assert.equal(revealsOnHover(`.card:hover .botao { visibility: visible; }`).length, 1);
  assert.equal(revealsOnHover(`:host(:hover) .botao { @include et.mostra; }`)[0].usesPiece, true);
  // a mão no próprio botão não é revelar nada
  assert.deepEqual(revealsOnHover(`.botao:hover { opacity: 1; }`), []);
});
