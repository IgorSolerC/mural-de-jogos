import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type GuideItem = { what: string; mark: string; keys?: string; note?: string; notes?: boolean };

/** A Ajuda: todas as marcas, em partes. `notes`: só onde o link para outra anotação abre alguma. */
export const GUIDE: readonly { title: string; items: readonly GuideItem[] }[] = [
  {
    title: 'Texto',
    items: [
      { what: 'Negrito', mark: '**texto**', keys: 'Ctrl+B' },
      { what: 'Itálico', mark: '*texto*', keys: 'Ctrl+I' },
      { what: 'Riscado', mark: '~~texto~~', keys: 'Ctrl+Shift+X' },
      { what: 'Marca-texto', mark: '==texto==', keys: 'Ctrl+Shift+H' },
      { what: 'Spoiler', mark: '||texto||', note: 'Uma tarja preta que some ao tocar. >!texto!< também vale.' },
      { what: 'Código', mark: '`texto`', keys: 'Ctrl+E' },
    ],
  },
  {
    title: 'Parágrafos e listas',
    items: [
      { what: 'Título 1', mark: '# Título' },
      { what: 'Título 2', mark: '## Título' },
      { what: 'Título 3', mark: '### Título' },
      { what: 'Citação', mark: '> texto' },
      { what: 'Texto sutil', mark: '-# texto', note: 'A linha menor e mais clara, para o que é só um detalhe (como no Discord).' },
      { what: 'Bloco de código', mark: '```', note: 'Numa linha antes do código e noutra depois.' },
      { what: 'Tarefas', mark: '- [ ] tarefa', keys: 'Ctrl+Shift+9', note: 'Feita: - [x] tarefa.' },
      { what: 'Lista', mark: '- item', keys: 'Ctrl+Shift+8' },
      { what: 'Lista numerada', mark: '1. item', keys: 'Ctrl+Shift+7', note: 'Enter continua a lista (os números de baixo seguem); Enter num item vazio termina. Dentro de um item, 1.1. item também vale.' },
      {
        what: 'Dentro do item',
        mark: '- [ ] tarefa\n  descrição',
        keys: 'Shift+Enter',
        note: 'As linhas com dois espaços (ou mais) antes, embaixo de um item, são dele: a descrição, uma foto, outra lista. Feita a tarefa, tudo é riscado junto.',
      },
      { what: 'Recuar', mark: '  item', keys: 'Tab', note: 'Põe a linha dois espaços para dentro (sempre num número par, que conta como dentro do item de cima); Shift+Tab volta.' },
    ],
  },
  {
    title: 'Links, tabelas e divisória',
    items: [
      { what: 'Link para um endereço', mark: '[texto](https://…)', keys: 'Ctrl+K', note: 'Colar um endereço com um texto selecionado também faz o link.' },
      { what: 'Link para outra anotação', mark: '[[Título]]', notes: true, note: '[[Título|texto]] mostra o texto no lugar do título.' },
      { what: 'Tabela', mark: '| a | b |', note: 'A segunda linha é | --- | --- |. Na tabela, Tab anda entre as células.' },
      { what: 'Divisória', mark: '---' },
    ],
  },
  {
    title: 'Widgets, cada um numa linha só dele',
    items: [
      { what: 'Contador', mark: '{{contador: 19/11/2026 18:00 | Nome}}', note: 'Sem o ano, todo ano. Repetindo: todo dia 7:00, toda sexta 18:00, todo dia 5. Outros jeitos: neon, placar, riscado.' },
      { what: 'Imagem', mark: '{{imagem: https://… | legenda}}', note: 'Colada como foto; polaroid ou recorte no fim trocam a moldura.' },
      { what: 'Vídeo', mark: '{{video: https://youtu.be/… | legenda}}', note: 'YouTube, Vimeo ou um .mp4, que toca ali.' },
      { what: 'Áudio', mark: '{{audio: https://… | nome}}', note: 'Um .mp3, YouTube, Vimeo ou .mp4. Outros jeitos: simples, vinil.' },
      { what: 'Nota', mark: '{{nota: Título}}', note: 'A ficha colada em miniatura. Pelo Inserir, qualquer ficha, de qualquer mural.' },
      { what: 'Tamanho', mark: '{{… | mini}}', note: 'Também pequeno e grande; sem nada, o médio.' },
    ],
  },
  {
    title: 'Símbolos',
    items: [
      { what: 'Setas', mark: '-> <- <-> =>', note: 'Viram → ← ↔ ⇒ (--> e <-- compridas).' },
      { what: 'Sinais', mark: '!= >= <= ~= +-', note: 'Viram ≠ ≥ ≤ ≈ ±.' },
      { what: 'A marca como ela é', mark: '\\*', note: 'A barra antes de uma marca não deixa ela formatar.' },
    ],
  },
];

/**
 * A Ajuda do editor de texto (ver ui/rich-editor.ts): todas as marcas, em partes, como a lista de
 * atalhos do Docs. Cada uma com o nome, o jeito de escrever na letra de máquina (que quebra a linha,
 * por mais comprida que seja) e o atalho de teclado na ponta (no toque, sem atalho). Vem num pedaço à
 * parte, quando a Ajuda abre pela primeira vez.
 */
@Component({
  selector: 'app-markup-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="guia-sobre">O que a régua faz vira uma marca no próprio texto, e dá para escrever as marcas à mão. Na aba “Ver como fica” aparece o resultado.</p>
    @for (sec of sections(); track sec.title; let i = $index) {
      <section class="guia-secao" [attr.aria-labelledby]="idPrefix() + '-' + i">
        <h3 class="guia-secao-titulo" [id]="idPrefix() + '-' + i">{{ sec.title }}</h3>
        <dl class="guia-lista">
          @for (g of sec.items; track g.mark) {
            <div class="guia-item">
              <dt class="guia-nome">{{ g.what }}</dt>
              <dd class="guia-marca"><code>{{ g.mark }}</code></dd>
              @if (g.keys) {
                <dd class="guia-atalho"><kbd>{{ g.keys }}</kbd></dd>
              }
              @if (g.note) {
                <dd class="guia-nota">{{ g.note }}</dd>
              }
            </div>
          }
        </dl>
      </section>
    }
  `,
  styles: `
    /* a Ajuda mede a si mesma: com a régua presa em cima do teclado, a folha deixa de ser medida */
    :host {
      display: block;
      container: guia / inline-size;
    }
    .guia-sobre {
      max-width: 62ch;
      margin: -2px 0 8px;
      font-size: 0.9rem;
      line-height: 1.4;
      color: var(--ink-2);
    }
    .guia-secao + .guia-secao {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed rgb(21 21 21 / 0.14);
    }
    .guia-secao-titulo {
      margin: 0 0 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink);
    }
    .guia-lista {
      margin: 0;
    }
    .guia-item {
      display: grid;
      grid-template-columns: 10.5rem minmax(0, 1fr) auto;
      align-items: baseline;
      column-gap: 14px;
      padding: 5px 0;
    }
    .guia-item + .guia-item {
      border-top: 1px solid rgb(21 21 21 / 0.07);
    }
    .guia-nome {
      grid-column: 1;
      font-weight: 600;
      font-size: 0.94rem;
    }
    .guia-marca {
      grid-column: 2;
      min-width: 0;
      margin: 0;
    }
    .guia-marca code {
      padding: 1px 5px;
      border-radius: 2px;
      background: rgb(21 21 21 / 0.07);
      font-family: var(--f-mono);
      font-weight: 700;
      font-size: 0.9rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .guia-atalho {
      grid-column: 3;
      grid-row: 1;
      margin: 0;
    }
    .guia-atalho kbd {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      color: var(--ink-2);
      white-space: nowrap;
    }
    .guia-nota {
      grid-column: 2 / -1;
      margin: 3px 0 0;
      font-size: 0.86rem;
      line-height: 1.35;
      color: var(--ink-2);
    }
    /* estreita: o nome e o atalho na mesma linha, o jeito de escrever e a nota embaixo */
    @container guia (max-width: 519px) {
      .guia-item {
        grid-template-columns: minmax(0, 1fr) auto;
        row-gap: 3px;
      }
      .guia-marca,
      .guia-nota {
        grid-column: 1 / -1;
      }
      .guia-atalho {
        grid-column: 2;
      }
    }
    @media (pointer: coarse) {
      .guia-atalho {
        display: none;
      }
    }
  `,
})
export class MarkupGuide {
  /** O link para outra anotação abre alguma aqui (o editor das anotações): a Ajuda fala dele. */
  readonly noteLinks = input(false);
  /** O começo dos ids dos títulos das partes. */
  readonly idPrefix = input('guia');

  protected readonly sections = computed(() => {
    const notes = this.noteLinks();
    return GUIDE.map((sec) => ({ title: sec.title, items: sec.items.filter((g) => notes || !g.notes) }));
  });
}
