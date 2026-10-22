// O cofre de ponta a ponta no Chrome (PLANO-COFRE.md, 17.6, parte 4): a página e a API de verdade, pelo
// Worker de teste (worker-e2e.ts, com o Google e o Murall de mentira), e a passkey no autenticador
// virtual do Chrome, com PRF. Faz: a porta (seguro e isolado), entrar, criar com a frase sorteada,
// abrir com a senha e a passkey, guardar uma senha, trancar e abrir pelo código do kit, gerenciar,
// conferir as vazadas, a vigia do DOM e, por fim, congelar.
//
// O puppeteer-core não é dependência do projeto: rode numa pasta à parte.
//   1. npx wrangler d1 migrations apply cofre-e2e --local -c test/e2e/wrangler.e2e.toml   (em cofre-api)
//   2. npx ng build cofre   (na raiz) e   npx wrangler dev -c test/e2e/wrangler.e2e.toml --port 8790
//   3. numa pasta à parte: npm i puppeteer-core@24, copie este arquivo para lá e
//      node chrome.mjs <pasta das fotos>
// Para rodar de novo do zero, esvazie as tabelas do banco local cofre-e2e.
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:8790';
const FOTOS = process.argv[2];
const erros = [];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1100 });
page.on('console', (m) => {
  if (m.type() === 'error' || /Refused|Content Security|TrustedHTML|Trusted Type/i.test(m.text())) erros.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

const cdp = await page.createCDPSession();
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
});

await page.setRequestInterception(true);
let google = null;
page.on('request', (r) => {
  if (r.url().startsWith('https://accounts.google.com')) {
    google = r.url();
    r.abort();
  } else r.continue();
});

const esperar = async (cond, ms = 30000, oQue = 'condição') => {
  const fim = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > fim) throw new Error(`não chegou: ${oQue}`);
    await new Promise((ok) => setTimeout(ok, 150));
  }
};
const temTexto = (t) => page.evaluate((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), t);
/** Abre uma parte dos Ajustes do cofre pelo índice (a etiqueta tem o nome e a dica). */
const aba = async (nome) => {
  await esperar(() => page.evaluate((n) => [...document.querySelectorAll('[role=tab] .parte-nome')].some((t) => t.textContent.trim() === n), nome), 30000, `parte ${nome}`);
  await page.evaluate((n) => [...document.querySelectorAll('[role=tab] .parte-nome')].find((t) => t.textContent.trim() === n).closest('button').click(), nome);
};
const clicar = async (texto) => {
  await esperar(() => page.evaluate((t) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === t && !b.disabled), texto), 30000, `botão ${texto}`);
  await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t && !b.disabled).click(), texto);
};
const digitar = async (seletor, texto) => {
  await page.waitForSelector(seletor);
  await page.click(seletor, { clickCount: 3 });
  await page.type(seletor, texto);
};
const foto = (nome) => page.screenshot({ path: `${FOTOS}/${nome}.png`, fullPage: true });
const passo = (t) => console.log(`✓ ${t}`);

async function entrar() {
  google = null;
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await clicar('Entrar com o Google');
  await esperar(() => google, 10000, 'ida ao Google');
  const url = new URL(google);
  if (url.searchParams.get('code_challenge_method') !== 'S256' || url.searchParams.get('scope') !== 'openid') throw new Error('URL do Google estranha');
  await page.goto(`${BASE}/entrar?state=${url.searchParams.get('state')}&code=codigo-e2e`, { waitUntil: 'networkidle0' });
  if ((await page.evaluate(() => location.pathname)) !== '/') throw new Error('a URL não foi limpa');
}

try {
  // 1. a porta, com as proteções valendo
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const protecoes = await page.evaluate(() => ({ seguro: isSecureContext, isolado: crossOriginIsolated }));
  if (!protecoes.seguro || !protecoes.isolado) throw new Error(`proteções: ${JSON.stringify(protecoes)}`);
  if (await page.$('.vigia')) throw new Error('a vigia do DOM disparou à toa');
  await foto('1-porta');
  passo('porta com as proteções (seguro e isolado)');

  // 2. entrar e criar
  await entrar();
  await page.waitForSelector('cofre-criar');
  const frase = await page.$eval('.frase', (e) => e.textContent.replace(/\s+/g, ''));
  await digitar('#senha-frase', frase);
  await clicar('Continuar');
  await clicar('Registrar o primeiro aparelho');
  await page.waitForSelector('.etiqueta');
  const etiqueta = await page.$eval('.etiqueta', (e) => e.textContent.trim());
  await foto('2-aparelho');
  passo(`passkey registrada: ${etiqueta}`);
  await clicar('Criar o cofre');
  await page.waitForSelector('.kit-codigo', { timeout: 60000 });
  const codigo = await page.$$eval('.kit-codigo span', (s) => s.map((x) => x.textContent).join('-'));
  await foto('3-kit');
  passo(`cofre criado; código ${codigo.slice(0, 4)}…`);
  await page.click('.guardei input');
  await clicar('Terminar');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);

  // 3. abrir com a senha e a passkey
  await entrar();
  await page.waitForSelector('#abrir-senha');
  await digitar('#abrir-senha', frase);
  await clicar('Abrir');
  await page.waitForSelector('cofre-aberto', { timeout: 60000 });
  await esperar(() => temTexto('Nenhuma senha guardada'), 20000, 'lista vazia');
  passo('aberto com a senha e a passkey (PRF)');

  // 4. guardar uma senha
  await clicar('Nova senha');
  await digitar('#item-titulo', 'Banco do teste');
  await digitar('#item-usuario', 'fulano');
  await digitar('#item-senha', 'senha-do-teste-1');
  await digitar('#item-url', 'banco.exemplo');
  await clicar('Salvar');
  await esperar(() => temTexto('Pôr na lixeira'), 20000, 'item salvo');
  await foto('4-item');
  await clicar('Voltar à lista');
  await esperar(() => temTexto('Banco do teste'), 10000, 'item na lista');
  await foto('5-lista');
  passo('senha guardada e listada');
  await clicar('Trancar');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);

  // 5. abrir pelo código do kit: a senha guardada está lá
  await entrar();
  await page.waitForSelector('#abrir-senha');
  await clicar('Usar o código de recuperação');
  await digitar('#abrir-senha', frase);
  await digitar('#abrir-codigo', codigo);
  await clicar('Abrir');
  await page.waitForSelector('cofre-aberto', { timeout: 60000 });
  await esperar(() => temTexto('Banco do teste'), 20000, 'item depois de reabrir');
  const aviso = await temTexto('código de recuperação');
  await foto('6-pelo-codigo');
  passo(`aberto pelo código; a senha guardada continua lá; aviso do código: ${aviso}`);

  // 6. gerenciar: um código novo (o de antes já foi gasto) e trocar a senha
  await clicar('Ajustes');
  await esperar(() => temTexto('Ajustes do cofre'), 20000, 'os ajustes');
  await aba('Recuperação');
  await clicar('Gerar um código novo');
  await clicar('Gerar');
  await page.waitForSelector('.kit-codigo', { timeout: 30000 });
  const codigoNovo = await page.$$eval('.kit-codigo span', (s) => s.map((x) => x.textContent).join('-'));
  await page.click('.guardei input');
  await clicar('Terminar');
  await aba('Senha mestra');
  await digitar('#g-atual', frase);
  await clicar('Sortear frase');
  const novaSenha = await esperar(() => page.$eval('#g-nova', (e) => e.value), 10000, 'frase sorteada no campo');
  await digitar('#g-confirmacao', novaSenha);
  await clicar('Trocar a senha');
  await esperar(() => temTexto('Senha mestra trocada'), 60000, 'senha trocada');
  await foto('7-gerenciar');
  passo(`código novo (${codigoNovo.slice(0, 4)}…) e senha trocada`);
  await clicar('Trancar');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);

  // 7. a senha nova abre com a passkey
  await entrar();
  await page.waitForSelector('#abrir-senha');
  await digitar('#abrir-senha', novaSenha);
  await clicar('Abrir');
  await page.waitForSelector('cofre-aberto', { timeout: 60000 });
  await esperar(() => temTexto('Banco do teste'), 20000, 'item com a senha nova');
  passo('a senha nova abre o cofre, com a senha guardada lá');
  // a base de senhas vazadas de verdade, de dentro do cofre isolado (só 5 caracteres do hash saem)
  await clicar('Ajustes');
  await aba('Senhas vazadas');
  await clicar('Conferir senhas vazadas');
  const bilhete = await esperar(() => page.$eval('.bilhete', (e) => e.textContent).catch(() => null), 20000, 'resposta da base de vazadas');
  if (/Não deu/.test(bilhete)) throw new Error(`a base de vazadas não respondeu de dentro do cofre: ${bilhete}`);
  passo(`base de vazadas: ${bilhete.trim()}`);
  if (await page.$('.vigia')) throw new Error('a vigia do DOM disparou à toa');
  passo('a vigia do DOM ficou quieta o tempo todo');
  // e pega o que uma extensão injetar
  await page.evaluate(() => document.body.appendChild(document.createElement('extensao-injetada')));
  await esperar(() => page.$('.vigia'), 5000, 'a vigia avisar da injeção');
  passo('a vigia do DOM avisou de um elemento injetado');
  await clicar('Trancar');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);

  // 8. congelar só com o Google: a tela mostra até quando, e a próxima entrada já chega congelada
  await entrar();
  await clicar('Suspeita de algo? Congelar o cofre');
  await clicar('Congelar por 24 horas');
  await page.waitForSelector('.carimbo', { timeout: 20000 });
  await foto('8-congelado');
  await entrar();
  await page.waitForSelector('.carimbo', { timeout: 20000 });
  if (await page.$('#abrir-senha')) throw new Error('congelado, mas o campo da senha apareceu');
  passo(`congelado: ${await page.$eval('.ate', (e) => e.textContent.trim())}`);
} catch (e) {
  erros.push(`FALHOU: ${e.message}`);
  await foto('erro').catch(() => undefined);
} finally {
  await browser.close();
}
console.log(erros.length ? `\nProblemas:\n${erros.join('\n')}` : '\nTudo certo, sem erro no console.');
process.exit(erros.some((e) => e.startsWith('FALHOU')) ? 1 : 0);
