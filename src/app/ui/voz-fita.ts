import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { ContextMenu, MenuItem, MenuSections } from './context-menu';
import { ICON, IconModule } from './icons';
import { Sentence, findAgain, maxSpeech, rangesOf, rangesOfChars, sentenceAt, sentencesOf } from './voz-frases';
import { VOICE_LANGS, VOICE_LANG_ORDER, VOICE_RATES, VoiceLang, Voz, voiceLabel } from '../core/voz';
import { reducedMotion } from '../core/motion';

/** Os nomes do realce no CSS (styles.scss): a frase sendo lida e, dentro dela, a palavra. */
export const VOICE_HIGHLIGHT = 'voz';
export const VOICE_WORD_HIGHLIGHT = 'voz-palavra';

/** Depois de a pessoa rolar com a mão, a folha não rola sozinha por este tanto (ms). */
const HANDS_OFF_MS = 4000;
/** Tocar nisso não é escolher a frase: é o que a coisa faz (o link, a caixinha, o spoiler, o card). */
const OWN_TAP = 'a, button, input, label, summary, [role="button"], [role="link"], .spoiler:not(.revelado)';

/**
 * Ouvir a nota em voz alta (PLANO-VOZ.md): a fita presa ao pé da folha da ficha aberta (na leitura e na tela
 * cheia), com as teclas de metal do toca-fitas (o parcial ui/_toca-fitas.scss, o mesmo do widget de som):
 * a frase anterior, tocar e pausar, a próxima; a etiqueta da língua (troca a língua e a voz), o contador
 * ("3 / 24"), a velocidade e parar. A frase lida ganha o marca-texto (`::highlight(voz)`) e a folha rola
 * até ela; tocar numa frase lê dali.
 *
 * Quem usa dá o que se lê (`roots`: o nome e o texto desenhado) e a folha que rola (`scroller`), e chama
 * `choose` no botão de ouvir: o menu das três línguas abre sempre (a pessoa escolhe toda vez). Só lê: nada
 * é gravado na nota, então a compartilhada e a visita não sentem nada. A nota que muda no meio (outra
 * pessoa escreveu, um spoiler se abriu) refaz as frases e a leitura segue de onde estava.
 */
@Component({
  selector: 'app-voz-fita',
  imports: [ContextMenu, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.lendo]': 'reading()' },
  template: `
    <app-context-menu #menu caption="Ouvir a nota em" [sections]="menuSections()" />
    @if (reading()) {
      <div class="fita" role="group" aria-label="Ouvir a nota">
        @if (voz.failure(); as f) {
          <p class="aviso" role="alert">{{ f }}</p>
        }
        <div class="chapa">
          <button #lingua type="button" class="lingua tocavel" aria-haspopup="menu" [attr.aria-label]="'Língua: ' + langName() + '. Trocar a língua ou a voz'" [title]="voiceName()" (click)="choose($event, lingua)">
            <span class="lingua-nome">{{ langName() }}</span>
            <lucide-icon [img]="OpenIcon" [size]="14" aria-hidden="true" />
          </button>
          <span class="teclas">
            <button type="button" class="tecla tocavel" aria-label="Frase anterior" title="Frase anterior" [disabled]="voz.at() <= 0" (click)="voz.prev()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.6" y="6.2" width="2.4" height="11.6" rx="0.6" /><path d="M19.2 6.6v10.8L8.6 12z" /></svg>
            </button>
            <button type="button" class="tecla tecla-tocar tocavel" [class.baixa]="voz.playing()" [attr.aria-pressed]="voz.playing()" [attr.aria-label]="voz.playing() ? 'Pausar' : 'Ouvir'" [title]="voz.playing() ? 'Pausar' : 'Ouvir'" (click)="voz.toggle()">
              @if (voz.playing()) {
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.2" y="5" width="4.1" height="14" rx="1.2" /><rect x="13.7" y="5" width="4.1" height="14" rx="1.2" /></svg>
              } @else {
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.6c0-.9 1-1.5 1.8-1l9 6.4c.7.5.7 1.5 0 2l-9 6.4c-.8.5-1.8 0-1.8-1z" /></svg>
              }
            </button>
            <button type="button" class="tecla tocavel" aria-label="Próxima frase" title="Próxima frase" [disabled]="voz.at() >= voz.total() - 1" (click)="voz.next()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 6.6v10.8L15.4 12z" /><rect x="17" y="6.2" width="2.4" height="11.6" rx="0.6" /></svg>
            </button>
          </span>
          <span class="contagem" aria-hidden="true">{{ shownAt() }}<small> / {{ voz.total() }}</small></span>
          <button type="button" class="velocidade tocavel" [attr.aria-label]="'Velocidade ' + rateLabel() + '. Trocar'" title="Velocidade" (click)="nextRate()">{{ rateLabel() }}</button>
          <button type="button" class="parar tocavel" aria-label="Parar de ouvir" title="Parar de ouvir" (click)="stop()">
            <lucide-icon [img]="CloseIcon" [size]="18" aria-hidden="true" />
          </button>
        </div>
        <p class="sr-only" aria-live="polite">{{ status() }}</p>
      </div>
    }
  `,
  styleUrl: './voz-fita.scss',
})
export class VozFita {
  protected readonly voz = inject(Voz);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menu = viewChild.required<ContextMenu>('menu');

  /** O que se lê, na ordem: o nome da ficha e o texto desenhado. */
  readonly roots = input<readonly (HTMLElement | null | undefined)[]>([]);
  /** A folha que rola (para levar a frase lida para a vista). */
  readonly scroller = input<HTMLElement | null>(null);
  /** De qual ficha é (outra ficha aberta no lugar acaba a leitura). */
  readonly key = input<string | null>(null);
  /** A fita está à mostra (só a cartolina esconde a folha: a leitura acaba). */
  readonly active = input(true);

  protected readonly OpenIcon = ICON.abrir;
  protected readonly CloseIcon = ICON.fechar;

  /** Lendo aqui (esta fita começou a leitura de agora; o serviço é um só no site): a fita aparece, e o marca-texto e o tocar valem. */
  readonly reading = computed(() => this.voz.owner() === this && this.voz.lang() !== null);
  /** Nada à mostra para ler (só spoilers fechados, só widgets): o menu diz, em vez de não fazer nada. */
  private readonly nothing = signal(false);

  private list: Sentence[] = [];
  private observer: MutationObserver | null = null;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private manualAt = 0;
  /** Até quando a rolagem é a da própria fita (a suave leva um pouco). */
  private autoUntil = 0;

  protected readonly langName = computed(() => {
    const l = this.voz.lang();
    return l ? VOICE_LANGS[l].name : '';
  });
  protected readonly voiceName = computed(() => {
    const v = this.voz.voice();
    return v ? `Voz: ${voiceLabel(v)}` : 'A voz que o navegador escolher';
  });
  protected readonly rateLabel = computed(() => `${String(this.voz.rate()).replace('.', ',')}×`);
  /** O número da frase no contador (no fim, a última; antes de tocar, a primeira). */
  protected readonly shownAt = computed(() => (this.voz.ended() ? this.voz.total() : Math.max(this.voz.at(), 0) + 1));
  protected readonly status = computed(() => {
    if (this.voz.ended()) return 'A nota acabou.';
    if (!this.voz.playing()) return 'Pausado.';
    return `Lendo em ${this.langName()}.`;
  });

  /** O menu: as três línguas (a sem voz neste navegador, apagada, dizendo por quê) e, lendo, as vozes da língua. */
  protected readonly menuSections = computed<MenuSections>(() => {
    const now = this.reading() ? this.voz.lang() : null;
    const langs: MenuItem[] = VOICE_LANG_ORDER.map((lang) => {
      const voice = this.voz.voiceOf(lang);
      const info = VOICE_LANGS[lang];
      return {
        id: lang,
        label: info.name,
        icon: ICON.idiomas,
        on: lang === now,
        disabled: !voice || this.nothing(),
        hint: this.nothing() ? 'Não há texto à mostra para ler (o spoiler fechado e as fotos não são lidos).' : voice ? `Voz: ${voiceLabel(voice)}` : `Este navegador não tem voz em ${info.name.toLowerCase()}. No Chrome e no Edge do computador, ela vem pela internet.`,
        run: () => this.listen(lang),
      };
    });
    if (!now) return [langs];
    const chosen = this.voz.voice();
    const voices: MenuItem[] = this.voz.voicesOf(now).map((v) => ({
      id: `voz:${v.name}`,
      label: voiceLabel(v),
      icon: ICON.fones,
      on: v === chosen,
      run: () => this.voz.setVoice(now, v.name),
    }));
    return voices.length > 1 ? [langs, voices] : [langs];
  });

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => this.stop());

    // outra ficha abriu no lugar, ou a folha sumiu (só a cartolina): a leitura acaba
    // (só quando muda de verdade: a mesma ficha desenhada de novo, com o texto novo, segue lendo)
    let was: { key: string | null; active: boolean } | null = null;
    effect(() => {
      const now = { key: this.key(), active: this.active() };
      if (was && (was.key !== now.key || was.active !== now.active)) untracked(() => this.stop());
      was = now;
    });
    // a leitura acabou por fora (outra fita começou, a página saiu): esta esquece que lia
    effect(() => {
      if (!this.reading() && untracked(() => this.observer !== null)) untracked(() => this.forget());
    });
    // o marca-texto da frase e da palavra
    effect(() => {
      const at = this.voz.at();
      const word = this.voz.word();
      if (!this.reading()) return;
      untracked(() => this.paint(at, word));
    });
    // a frase lida (ou a escolhida nas teclas, pausado) vem para a vista
    effect(() => {
      const at = this.voz.at();
      if (this.reading()) untracked(() => this.bringIntoView(at));
    });
    // o texto desenhado de novo (o modo sem spoilers, o texto que some e volta): observa o novo e refaz
    effect(() => {
      this.roots();
      if (!untracked(this.reading)) return;
      untracked(() => {
        // o texto escondido (o modo sem spoilers) não se lê: a leitura acaba
        if (!this.roots().every(Boolean)) {
          this.stop();
          return;
        }
        this.observer?.disconnect();
        this.observer = null;
        this.unwatchScroller?.();
        this.unwatchScroller = null;
        this.watch();
        this.rebuild();
      });
    });
  }

  /** O botão de ouvir (na faixa) ou a etiqueta da língua (na fita): abre o menu das línguas embaixo dele. */
  choose(e: MouseEvent, button: HTMLElement): void {
    const menu = this.menu();
    if (menu.isOpenFor('ouvir')) {
      menu.close(true);
      return;
    }
    // nada à mostra para ler: as línguas ficam apagadas, dizendo por quê
    this.nothing.set(!this.build('pt').length);
    const r = button.getBoundingClientRect();
    menu.show({ key: 'ouvir', x: r.left, y: r.bottom + 4, back: button, by: e.detail === 0 ? 'teclado' : 'mouse' });
  }

  /** Começa a ler na língua (ou troca a língua da leitura de agora, da frase onde estava). */
  private listen(lang: VoiceLang): void {
    const before = this.reading() ? this.list[this.voz.at()]?.text : undefined;
    const near = Math.max(this.voz.at(), 0);
    this.list = this.build(lang);
    if (!this.list.length) return;
    const from = before === undefined ? 0 : Math.max(findAgain(before, near, this.list), 0);
    this.voz.start(this.list.map((s) => s.text), lang, from, this);
    this.watch();
  }

  protected nextRate(): void {
    const i = VOICE_RATES.indexOf(this.voz.rate());
    this.voz.setRate(VOICE_RATES[(i + 1) % VOICE_RATES.length]);
  }

  /** Acaba a leitura desta fita (o X, a ficha que fecha). */
  stop(): void {
    if (untracked(this.voz.owner) === this) this.voz.stop();
    this.forget();
  }

  private forget(): void {
    this.list = [];
    this.observer?.disconnect();
    this.observer = null;
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
    this.unwatchScroller?.();
    this.unwatchScroller = null;
    // o marca-texto é um só na página: o de outra fita que lê agora fica
    const other = untracked(this.voz.owner);
    if (typeof CSS !== 'undefined' && 'highlights' in CSS && (other === null || other === this)) {
      CSS.highlights.delete(VOICE_HIGHLIGHT);
      CSS.highlights.delete(VOICE_WORD_HIGHLIGHT);
    }
  }

  private build(lang: VoiceLang): Sentence[] {
    const tag = VOICE_LANGS[lang].tag;
    const roots = this.roots().filter((r): r is HTMLElement => !!r);
    return sentencesOf(roots, { lang: tag, max: maxSpeech(tag) });
  }

  /** Acompanha a nota que muda (o texto que a folha desenha de novo), o tocar numa frase e a mão que rola. */
  private watch(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => {
      if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(() => this.rebuild(), 200);
    });
    for (const root of this.roots()) {
      if (root) this.observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['inert', 'open'] });
    }
    const scroller = this.scroller();
    if (!scroller) return;
    // qualquer rolagem que não foi a da fita é da pessoa (a roda, o dedo, a barra, as teclas)
    const hands = () => {
      if (Date.now() > this.autoUntil) this.manualAt = Date.now();
    };
    const tap = (e: MouseEvent) => this.tap(e);
    scroller.addEventListener('scroll', hands, { passive: true });
    scroller.addEventListener('click', tap);
    this.unwatchScroller = () => {
      scroller.removeEventListener('scroll', hands);
      scroller.removeEventListener('click', tap);
    };
  }
  private unwatchScroller: (() => void) | null = null;

  /** As frases de novo; a leitura segue da mesma frase (ou da mais parecida). */
  private rebuild(): void {
    this.rebuildTimer = null;
    const lang = this.voz.lang();
    if (!lang || !this.reading()) return;
    const at = this.voz.at();
    const before = this.list[at]?.text ?? '';
    const next = this.build(lang);
    const same = next.length === this.list.length && next.every((s, i) => s.text === this.list[i].text);
    this.list = next;
    if (!same) this.voz.update(next.map((s) => s.text), findAgain(before, at, next));
    this.paint(this.voz.at(), this.voz.word());
  }

  /** Tocou numa frase do texto (sem ser num link, numa caixinha, num spoiler fechado, nem escolhendo um trecho): lê dali. */
  private tap(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0) return;
    const target = e.target as Element | null;
    if (!target || target.closest(OWN_TAP) || target.closest('app-voz-fita')) return;
    if (!this.roots().some((r) => r?.contains(target))) return;
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed) return;
    const point = caretAt(e.clientX, e.clientY);
    if (!point) return;
    const i = sentenceAt(this.list, point.node, point.offset);
    if (i < 0) return;
    this.voz.go(i);
    if (!this.voz.playing()) this.voz.toggle();
  }

  private paint(at: number, word: { from: number; to: number } | null): void {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
    const s = this.list[at];
    const ranges = s ? rangesOf(s) : [];
    if (ranges.length) CSS.highlights.set(VOICE_HIGHLIGHT, new Highlight(...ranges));
    else CSS.highlights.delete(VOICE_HIGHLIGHT);
    const words = s && word ? rangesOfChars(s, word.from, word.to) : [];
    if (words.length) CSS.highlights.set(VOICE_WORD_HIGHLIGHT, new Highlight(...words));
    else CSS.highlights.delete(VOICE_WORD_HIGHLIGHT);
  }

  /** A frase lida fora da vista (ou atrás da fita): a folha rola para ela ficar a um terço do alto. */
  private bringIntoView(at: number): void {
    const scroller = this.scroller();
    const s = this.list[at];
    if (!scroller || !s || Date.now() - this.manualAt < HANDS_OFF_MS) return;
    const [first] = rangesOf(s);
    if (!first) return;
    const box = first.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const tape = this.host.nativeElement.querySelector('.fita')?.getBoundingClientRect().height ?? 0;
    if (box.top >= view.top + 24 && box.bottom <= view.bottom - tape - 24) return;
    this.autoUntil = Date.now() + 900;
    scroller.scrollBy({ top: box.top - view.top - scroller.clientHeight / 3, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}

/** O nó de texto e a letra debaixo do ponto da tela (o Firefox tem um jeito, o Chrome e o Safari outro). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (typeof doc.caretPositionFromPoint === 'function') {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = document.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}
