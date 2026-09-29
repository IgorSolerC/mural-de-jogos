// Congela a aparência dos desenhos sorteados (ver src/app/core/frozen-looks.ts).
//   node scripts/freeze-looks.mjs              → grava só as impressões que ainda não existem
//   node scripts/freeze-looks.mjs damage:cafe   → regrava as que começam com o prefixo (mudança de propósito)
// Nunca regrave tudo de uma vez: o sentido do arquivo é o que já foi aprovado não mudar por tabela.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = join(root, 'src/app/core/frozen-looks.data.ts');
const args = process.argv.slice(2);
// "damage:cafe" regrava aquele desenho; "-scribble:espirais" tira do arquivo um desenho que saiu
const prefixes = args.filter((a) => !a.startsWith('-'));
const removed = args.filter((a) => a.startsWith('-')).map((a) => a.slice(1));

const dir = mkdtempSync(join(tmpdir(), 'freeze-looks-'));
const bundle = join(dir, 'looks.mjs');
await build({ entryPoints: [join(root, 'src/app/core/frozen-looks.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const { frozenPrints } = await import(pathToFileURL(bundle).href);
rmSync(dir, { recursive: true, force: true });
const now = frozenPrints();

let old = {};
let src = null;
try {
  src = readFileSync(dataFile, 'utf8');
} catch {}
if (src !== null) {
  // o arquivo existe: se não der para ler, nada é gravado (senão tudo viraria "novo" sem aviso)
  const body = src.slice(src.indexOf('= {') + 2, src.lastIndexOf('}') + 1).replace(/,\s*}$/, '}');
  old = JSON.parse(body);
}

const next = { ...old };
let gone = 0;
for (const k of Object.keys(next))
  if (removed.some((p) => k.startsWith(p))) {
    delete next[k];
    gone++;
  }
let added = 0,
  changed = 0,
  kept = 0;
const keptBy = {};
for (const [k, v] of Object.entries(now)) {
  if (!(k in old)) {
    next[k] = v;
    added++;
  } else if (old[k] !== v && prefixes.some((p) => k.startsWith(p))) {
    next[k] = v;
    changed++;
  } else if (old[k] !== v) {
    kept++;
    const item = k.split(':').slice(0, 2).join(':');
    keptBy[item] = (keptBy[item] ?? 0) + 1;
  }
}
const keys = Object.keys(next).sort();
const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(next[k])},`).join('\n');
writeFileSync(
  dataFile,
  `// Gerado por scripts/freeze-looks.mjs: as impressões digitais da aparência aprovada. Não edite à mão.\nexport const FROZEN_LOOKS: Record<string, string> = {\n${body}\n};\n`,
);
for (const [item, n] of Object.entries(keptBy)) console.log(`  mudou: ${item} (${n})`);
if (gone) console.log(`  saíram: ${gone}`);
const orphans = Object.keys(next).filter((k) => !(k in now));
if (orphans.length) console.log(`  sem desenho (o teste vai acusar; tire com -prefixo): ${[...new Set(orphans.map((k) => k.split(':').slice(0, 2).join(':')))].join(', ')}`);
console.log(`${added} novas, ${changed} regravadas${kept ? `, ${kept} diferentes mantidas (o teste vai acusar)` : ''}; ${keys.length} no total.`);
