// Imprime em PDF a anotação com tudo o que se escreve (src/app/ui/pdf-sheet.samples.ts), pelo mesmo
// caminho de quem usa: abre a anotação na leitura, toca em Mais → Salvar como PDF e imprime a folha
// com o Chrome. É para olhar: toda mudança no markdown ou num widget passa por aqui (ver DESIGN.md,
// "Salvar como PDF").
//   node scripts/pdf-amostra.mjs [endereço do site] [pasta de saída]
//   (o site no ar localmente: `npx ng serve --port 4390`, ou a build servida de dist/)
// Grava amostra.pdf (a anotação com tudo) e analise.pdf (o cabeçalho de uma análise) na pasta de saída
// (.angular/pdf-amostra, fora do git).
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? 'http://localhost:4390/').replace(/\/?$/, '/');
const out = resolve(process.argv[3] ?? join(root, '.angular/pdf-amostra'));
mkdirSync(out, { recursive: true });

const tmp = mkdtempSync(join(tmpdir(), 'pdf-amostra-'));
const bundle = join(tmp, 'samples.mjs');
await build({ entryPoints: [join(root, 'src/app/ui/pdf-sheet.samples.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const { pdfSampleText, PDF_SAMPLE_CARD } = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => existsSync(p));
const profile = mkdtempSync(join(out, 'perfil-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-first-run', '--window-size=1280,900'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (e) => console.error('erro na página:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  const day = '2026-10-24';
  const note = (id, name, text, extra = {}) => ({
    id,
    kind: 'anotacoes',
    game: { name, ...(extra.cover ? { coverUrl: extra.cover } : {}) },
    text,
    category: 'Viagens',
    subject: 'Portugal',
    tags: ['roteiro', 'outubro'],
    completedAt: day,
    createdAt: `${day}T10:00:00.000Z`,
    updatedAt: `${day}T10:00:00.000Z`,
    private: true,
  });
  const notes = [note('amostra-pdf', 'Viagem a Lisboa', pdfSampleText()), note(PDF_SAMPLE_CARD.id, PDF_SAMPLE_CARD.title, PDF_SAMPLE_CARD.text, { cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/library_600x900.jpg' })];
  // uma análise, para o cabeçalho com a capa, quem fez, as horas e a média
  const reviews = [
    {
      id: 'amostra-analise',
      kind: 'jogos',
      game: { name: 'Hades', by: 'Supergiant Games', year: 2020, source: 'manual', coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/library_600x900.jpg' },
      scores: { historia: 9, diversao: 10, jogabilidade: 10, visual: 9 },
      status: 'finalizado',
      difficulty: 'nenhuma',
      verdict: 'masterpiece',
      hoursPlayed: 62,
      text: [
        'Cada fuga conta um pedaço da história, e **morrer** faz parte do caminho.',
        '',
        '## O que ficou',
        '- A trilha',
        '- Os diálogos que mudam a cada volta',
        '',
        '> Ninguém escapa do submundo. Mas dá para tentar.',
      ].join('\n'),
      completedAt: '2026-03-03',
      createdAt: '2026-03-03T10:00:00.000Z',
      updatedAt: '2026-03-03T10:00:00.000Z',
    },
  ];
  await page.evaluateOnNewDocument((n, r) => {
    if (localStorage.getItem('pdf-amostra:semeado')) return;
    localStorage.setItem('pdf-amostra:semeado', '1');
    localStorage.setItem('mural-de-jogos:anotacoes:v1', n);
    localStorage.setItem('mural-de-jogos:resenhas:v1', r);
  }, JSON.stringify(notes), JSON.stringify(reviews));
  // a impressão de verdade não abre aqui: só avisa que foi pedida (a folha fica montada)
  await page.evaluateOnNewDocument(() => {
    window.print = () => {
      window.__pediuImpressao = true;
    };
  });

  /** Abre a ficha na leitura, pede o PDF pelo Mais e imprime a folha num arquivo. */
  const print = async (route, name, fileName) => {
    await page.emulateMediaType('screen');
    await page.goto(`${base}#/${route}`, { waitUntil: 'networkidle0' });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('app-review-card');
    await page.evaluate((title) => {
      const card = [...document.querySelectorAll('app-review-card')].find((c) => c.textContent?.includes(title));
      card?.querySelector('button.hit')?.click();
    }, name);
    await page.waitForSelector('dialog.reader[open] app-more-menu button.mais');
    await page.click('dialog.reader[open] app-more-menu button.mais');
    await page.waitForSelector('dialog.reader[open] .bilhete .item');
    const picked = await page.evaluate(() => {
      const item = [...document.querySelectorAll('dialog.reader[open] .bilhete .item')].find((b) => b.textContent?.includes('PDF'));
      item?.click();
      return !!item;
    });
    if (!picked) throw new Error('o Mais da leitura não tem "Salvar como PDF"');
    await page.waitForFunction(() => window.__pediuImpressao === true, { timeout: 30000 }).catch(async (e) => {
      console.error('a impressão não foi pedida; o bilhete diz:', await page.evaluate(() => document.querySelector('app-toast')?.textContent?.trim()));
      throw e;
    });
    console.log(`${name}: o arquivo se chama "${await page.title()}.pdf"`);
    await page.emulateMediaType('print');
    const file = join(out, fileName);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    console.log('PDF:', file);
  };
  await print('anotacoes', 'Viagem a Lisboa', 'amostra.pdf');
  await print('analises/jogos', 'Hades', 'analise.pdf');
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
