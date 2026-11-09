import type { LucideIconData } from 'lucide-angular';
import { ICON, tracoNaGrade } from '../icons';

/**
 * Os botões que moram nas peças do Visual (o widget selecionado, o card do cursor, a tabela do cursor):
 * as etiquetas de papel do site (`botao-papel`), pequenas, coladas à mão, cada uma torta do seu jeito.
 * São atalhos do dedo e do mouse (o teclado tem a régua e a folha do widget): ficam fora do Tab, e o
 * toque não tira o foco da folha (nem fecha o teclado do celular, nem tira o cursor da célula).
 *
 * - `etiqueta`: um botão de desenho só (o + e o − da tabela);
 * - `passos`: o − e o + com o nome do de agora no meio (o tamanho do widget);
 * - `ciclo`: o nome da escolha de agora e a setinha; o toque vai para a próxima (do fim, volta à
 *   primeira), com Shift para a de antes. As bolinhas dizem quantas são e em qual está.
 */

/** Uma escolha de um `ciclo` ou de um `passos`. */
export interface Opcao {
  valor: string;
  nome: string;
  /** O nome que aparece no botão, quando o inteiro é longo demais para ele (o leitor de tela ouve o inteiro). */
  curto?: string;
}

/** Até quantas escolhas as bolinhas aparecem (mais que isso, elas viram uma fileira que ninguém conta: a conta, "3/9"). */
const BOLAS_MAX = 5;

/** O desenho de um ícone (o mesmo traço do resto do site: o CSS dá o tamanho, e o traço vai junto), fora do Angular. */
export function desenho(icone: LucideIconData): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attrs: Record<string, string> = { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': String(tracoNaGrade()), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const [tag, a] of icone) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(a)) if (k !== 'key') el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}

/** Um botão das peças: fora do Tab, e o toque não leva o foco (o cursor e o teclado do celular ficam). */
function botao(classe: string, nome: string, aperta: (e: MouseEvent) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.tabIndex = -1;
  b.className = classe;
  b.setAttribute('aria-label', nome);
  b.title = nome;
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!b.disabled) aperta(e);
  });
  return b;
}

/** A etiqueta de desenho só: o + (ou o −, com o corte vermelho, `perigo`). */
export function etiqueta(o: { nome: string; icone: LucideIconData; perigo?: boolean; giro?: string; desligada?: boolean; aperta: () => void }): HTMLButtonElement {
  const b = botao('vis-etiqueta' + (o.perigo ? ' perigo' : ''), o.nome, o.aperta);
  if (o.giro) b.style.setProperty('--giro', o.giro);
  b.disabled = !!o.desligada;
  b.append(desenho(o.icone));
  return b;
}

/**
 * Uma ação da peça, com o nome à vista (o Editar). Ao contrário dos outros botões, entra no Tab: o teclado
 * precisa alcançar a ação, e a escolha de aparência ele faz na folha do widget.
 */
export function acao(o: { nome: string; icone: LucideIconData; giro?: string; classe: string; aperta: () => void }): HTMLButtonElement {
  const b = botao(`vis-acao ${o.classe}`, o.nome, o.aperta);
  if (o.giro) b.style.setProperty('--giro', o.giro);
  b.tabIndex = 0;
  const nome = document.createElement('span');
  nome.textContent = o.nome;
  b.append(desenho(o.icone), nome);
  return b;
}

/**
 * O − e o + com o nome do de agora no meio, a lápis ("Médio"): o − desliga na primeira escolha, o +
 * na última. `rotulo` é o que se muda ("o tamanho"), para o leitor de tela e a dica.
 */
export function passos(o: { rotulo: string; opcoes: readonly Opcao[]; at: number; escolhe: (valor: string) => void }): HTMLElement {
  const g = document.createElement('span');
  g.className = 'vis-passos';
  g.setAttribute('role', 'group');
  const atual = o.opcoes[o.at]?.nome ?? '';
  g.setAttribute('aria-label', `${o.rotulo[0].toLocaleUpperCase('pt-BR')}${o.rotulo.slice(1)}: ${atual}`);
  const anda = (d: -1 | 1) => {
    const v = o.opcoes[o.at + d];
    return etiqueta({
      nome: v ? `${d < 0 ? 'Diminuir' : 'Aumentar'} ${o.rotulo}: ${v.nome}` : d < 0 ? 'Já é o menor' : 'Já é o maior',
      icone: d < 0 ? ICON.tirar : ICON.adicionar,
      giro: d < 0 ? '-1.4deg' : '1.1deg',
      desligada: !v,
      aperta: () => v && o.escolhe(v.valor),
    });
  };
  const nome = document.createElement('span');
  nome.className = 'vis-passos-nome';
  nome.textContent = atual;
  nome.setAttribute('aria-hidden', 'true');
  g.append(anda(-1), nome, anda(1));
  return g;
}

/**
 * O botão que anda pelas escolhas: o desenho, o nome da de agora, as bolinhas (uma por escolha, a de
 * agora cheia; com mais que `BOLAS_MAX` escolhas, a conta "3/9") e a setinha. O toque vai para a próxima (da última, volta à
 * primeira); com Shift, para a de antes. `rotulo` é o nome do que se escolhe ("Jeito").
 */
export function ciclo(o: { rotulo: string; opcoes: readonly Opcao[]; at: number; icone: LucideIconData; giro?: string; escolhe: (valor: string) => void }): HTMLButtonElement {
  const n = o.opcoes.length;
  const at = Math.max(0, Math.min(o.at, n - 1));
  const proxima = o.opcoes[(at + 1) % n];
  const b = botao('vis-ciclo', `${o.rotulo}: ${o.opcoes[at].nome}. Trocar para ${proxima.nome}`, (e) => o.escolhe(o.opcoes[(at + (e.shiftKey ? n - 1 : 1)) % n].valor));
  if (o.giro) b.style.setProperty('--giro', o.giro);
  b.dataset['ciclo'] = o.rotulo;
  const nome = document.createElement('span');
  nome.className = 'vis-ciclo-nome';
  nome.textContent = o.opcoes[at].curto ?? o.opcoes[at].nome;
  b.append(desenho(o.icone), nome);
  if (n <= BOLAS_MAX) {
    const bolas = document.createElement('span');
    bolas.className = 'vis-ciclo-bolas';
    bolas.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < n; k++) bolas.append(Object.assign(document.createElement('i'), { className: k === at ? 'cheia' : '' }));
    b.append(bolas);
  } else {
    const conta = document.createElement('span');
    conta.className = 'vis-ciclo-conta';
    conta.setAttribute('aria-hidden', 'true');
    conta.textContent = `${at + 1}/${n}`;
    b.append(conta);
  }
  b.append(desenho(ICON.proximo));
  b.lastElementChild!.classList.add('vis-ciclo-seta');
  return b;
}
