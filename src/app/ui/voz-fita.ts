import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { ContextMenu, MenuItem, MenuSections } from './context-menu';
import { ICON, IconModule } from './icons';
import { Sentence, findAgain, maxSpeech, rangesOf, rangesOfChars, sentenceAt, sentencesOf } from './voz-frases';
import { VozEstudo } from './voz-estudo';
import { VOICE_LANGS, VOICE_LANG_ORDER, VOICE_RATES, VoiceHint, VoiceLang, Voz, voiceLabel } from '../core/voz';
import { reducedMotion } from '../core/motion';

/** Os nomes do realce no CSS (styles.scss): a frase sendo lida e, dentro dela, a palavra. */
export const VOICE_HIGHLIGHT = 'voz';
export const VOICE_WORD_HIGHLIGHT = 'voz-palavra';

/** Depois de a pessoa rolar com a mão, a folha não rola sozinha por este tanto (ms). */
const HANDS_OFF_MS = 4000;
/** Tocar nisso não é escolher a frase: é o que a coisa faz (o link, a caixinha, o spoiler, o card). */
const OWN_TAP = 'a, button, input, label, summary, [role="button"], [role="link"], .spoiler:not(.revelado)';
/** Onde a pessoa digita: as teclas da fita não valem ali (a caixinha da tarefa fica com o Espaço dela). */
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** Um menu ou uma lista com o foco: as setas são dele. */
const OWN_KEYS = '[role="menu"], [role="menubar"], [role="listbox"], [role="tablist"], [role="slider"], .menu-contexto';
/** Os atalhos da fita (PLANO-VOZ-ESTUDO.md): o que cada tecla faz. */
const KEYS: Readonly<Record<string, 'prev' | 'next' | 'play' | 'faster' | 'slower'>> = {
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  ' ': 'play',
  ArrowUp: 'faster',
  ArrowDown: 'slower',
};
/** Quanto a tecla de metal fica afundada quando o atalho a aperta (ms). */
const PRESS_MS = 150;
/** Quanto a dica de primeira vez fica em cima da chapa (ms). */
const HINT_MS = 8000;

/**
 * Ouvir a nota em voz alta (PLANO-VOZ.md): a fita presa ao pé da folha da ficha aberta (na leitura e na tela
 * cheia), com as teclas de metal do toca-fitas (o parcial ui/_toca-fitas.scss, o mesmo do widget de som):
 * a frase anterior, tocar e pausar, a próxima; a etiqueta da língua (troca a língua e a voz), o contador
 * ("3 / 24"), a velocidade e parar. A frase lida ganha o marca-texto (`::highlight(voz)`) e a folha rola
 * até ela; tocar numa frase lê dali. Com a fita à mostra, o teclado também a toca (PLANO-VOZ-ESTUDO.md): ← e
 * → a frase anterior e a próxima, Espaço pausa e continua, ↑ e ↓ a velocidade. E o modo estudo (a etiqueta do
 * rabisco, com o olho aberto ou fechado): lendo, o que a voz lê vira rabisco, e tocar numa palavra revela a frase dela; de novo, a esconde (ui/voz-estudo.ts).
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
    <app-context-menu #menu [caption]="menuKind() === 'velocidade' ? 'Velocidade' : 'Ouvir a nota em'" [sections]="menuSections()" (closed)="menuClosedAt = now()" />
    @if (reading()) {
      <div class="fita" role="group" aria-label="Ouvir a nota">
        @if (voz.failure(); as f) {
          <p class="aviso" role="alert">{{ f }}</p>
        } @else if (hint(); as h) {
          <!-- a dica de primeira vez (uma por aparelho); o leitor de tela já ouve o mesmo (aria-keyshortcuts, o aviso do modo estudo) -->
          <p class="dica" aria-hidden="true">
            @if (h === 'teclas') {
              <kbd>←</kbd><kbd>→</kbd> frases <span class="ponto">·</span> <kbd>Espaço</kbd> pausa <span class="ponto">·</span> <kbd>↑</kbd><kbd>↓</kbd> velocidade
            } @else {
              Toque numa frase para vê-la, e de novo para escondê-la.
            }
          </p>
        }
        <div class="chapa">
          <button #lingua type="button" class="lingua tocavel" aria-haspopup="menu" [attr.aria-label]="'Língua: ' + langName() + '. Trocar a língua ou a voz'" [title]="voiceName()" (click)="choose($event, lingua)">
            <span class="lingua-nome">{{ langName() }}</span>
            <span class="lingua-sigla" aria-hidden="true">{{ langCode() }}</span>
            <lucide-icon [img]="OpenIcon" [size]="14" aria-hidden="true" />
          </button>
          <span class="teclas">
            <button type="button" class="tecla tocavel" [class.baixa]="pressed() === 'prev'" aria-label="Frase anterior" title="Frase anterior (←)" aria-keyshortcuts="ArrowLeft" [disabled]="voz.at() <= 0" (click)="voz.prev()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.6" y="6.2" width="2.4" height="11.6" rx="0.6" /><path d="M19.2 6.6v10.8L8.6 12z" /></svg>
            </button>
            <button type="button" class="tecla tecla-tocar tocavel" [class.baixa]="voz.playing()" [attr.aria-pressed]="voz.playing()" [attr.aria-label]="voz.playing() ? 'Pausar' : 'Ouvir'" [title]="voz.playing() ? 'Pausar (Espaço)' : 'Ouvir (Espaço)'" aria-keyshortcuts="Space" (click)="voz.toggle()">
              @if (voz.playing()) {
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.2" y="5" width="4.1" height="14" rx="1.2" /><rect x="13.7" y="5" width="4.1" height="14" rx="1.2" /></svg>
              } @else {
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.6c0-.9 1-1.5 1.8-1l9 6.4c.7.5.7 1.5 0 2l-9 6.4c-.8.5-1.8 0-1.8-1z" /></svg>
              }
            </button>
            <button type="button" class="tecla tocavel" [class.baixa]="pressed() === 'next'" aria-label="Próxima frase" title="Próxima frase (→)" aria-keyshortcuts="ArrowRight" [disabled]="voz.at() >= voz.total() - 1" (click)="voz.next()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 6.6v10.8L15.4 12z" /><rect x="17" y="6.2" width="2.4" height="11.6" rx="0.6" /></svg>
            </button>
          </span>
          <!-- no celular de 320px a chapa quebra aqui: as teclas em cima, a velocidade, o estudo e o X embaixo -->
          <span class="quebra" aria-hidden="true"></span>
          <span class="contagem" aria-hidden="true">{{ shownAt() }}<small> / {{ voz.total() }}</small></span>
          <button #velocidade type="button" class="velocidade tocavel" aria-haspopup="menu" [attr.aria-label]="'Velocidade ' + rateLabel() + '. Trocar'" title="Velocidade (↑ ↓)" aria-keyshortcuts="ArrowUp ArrowDown" (click)="chooseRate($event, velocidade)">{{ rateLabel() }}</button>
          @if (canStudy) {
            <button type="button" class="estudo tocavel" [class.ligado]="voz.study()" [attr.aria-pressed]="voz.study()" aria-label="Modo estudo: o texto vira rabisco na tela" [title]="voz.study() ? 'Texto escondido (modo estudo): toque numa frase para vê-la, e de novo para escondê-la. Tocar aqui mostra o texto' : 'Texto à mostra. Tocar aqui o esconde (modo estudo): o texto vira rabisco, e tocar numa frase a revela'" (click)="toggleStudy()">
              <!-- o olho diz como o texto está: aberto, à mostra; fechado, escondido no rabisco -->
              <lucide-icon [img]="voz.study() ? HiddenIcon : ShownIcon" [size]="20" aria-hidden="true" />
            </button>
          }
          <button type="button" class="parar tocavel" aria-label="Parar de ouvir" title="Parar de ouvir" (click)="stop()">
            <lucide-icon [img]="CloseIcon" [size]="18" aria-hidden="true" />
          </button>
        </div>
        <p class="sr-only" aria-live="polite">{{ said() || status() }}</p>
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
  /** O modo estudo pelo olho (pedido do dono, 24/nov: o rabisco não dizia o que fazia): aberto, o texto à mostra. */
  protected readonly ShownIcon = ICON.ver;
  protected readonly HiddenIcon = ICON.esconder;
  /** O navegador sabe esconder as letras (o realce)? Sem isso, a etiqueta do modo estudo não aparece. */
  protected readonly canStudy = VozEstudo.supported();
  /** Os rabiscos do modo estudo (ui/voz-estudo.ts): só nesta fita, só lendo. */
  private readonly estudo = new VozEstudo();

  /** Lendo aqui (esta fita começou a leitura de agora; o serviço é um só no site): a fita aparece, e o marca-texto e o tocar valem. */
  readonly reading = computed(() => this.voz.owner() === this && this.voz.lang() !== null);
  /** O texto em rabisco agora: o modo estudo ligado, lendo aqui. */
  readonly studying = computed(() => this.canStudy && this.reading() && this.voz.study());
  /** Nada à mostra para ler (só spoilers fechados, só widgets): o menu diz, em vez de não fazer nada. */
  private readonly nothing = signal(false);

  private list: Sentence[] = [];
  private observer: MutationObserver | null = null;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private manualAt = 0;
  /** A ficha da leitura de agora (outra ficha no lugar: a leitura acaba, não se refaz nela). */
  private readingKey: string | null = null;
  /** Quando o menu fechou: o clique que fecha o menu (no texto) não é tocar numa frase. */
  protected menuClosedAt = 0;
  protected readonly now = () => Date.now();
  /** Até quando a rolagem é a da própria fita (a suave leva um pouco). */
  private autoUntil = 0;
  /** A tecla da chapa que um atalho acabou de apertar (ela afunda um instante, como se fosse o dedo). */
  protected readonly pressed = signal<'prev' | 'next' | null>(null);
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  /** O que o leitor de tela ouve de um atalho (a velocidade nova), no lugar do andamento, por um instante. */
  protected readonly said = signal('');
  private saidTimer: ReturnType<typeof setTimeout> | null = null;
  /** O Espaço desceu na fita: a subida dele também é dela (senão o botão com o foco seria apertado). */
  private spaceDown = false;
  /** A dica de primeira vez à mostra em cima da chapa (os atalhos, o tocar para revelar). */
  protected readonly hint = signal<VoiceHint | null>(null);
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private unlistenKeys: (() => void) | null = null;

  protected readonly langName = computed(() => {
    const l = this.voz.lang();
    return l ? VOICE_LANGS[l].name : '';
  });
  /** A sigla da língua ("JA"), no lugar do nome na chapa do celular estreito. */
  protected readonly langCode = computed(() => this.voz.lang()?.toUpperCase() ?? '');
  protected readonly voiceName = computed(() => {
    const v = this.voz.voice();
    return v ? `Voz: ${voiceLabel(v)}` : 'A voz que o navegador escolher';
  });
  protected readonly rateLabel = computed(() => rateName(this.voz.rate()));
  /** O que o menu mostra: as línguas (o botão de ouvir, a etiqueta da fita) ou as velocidades. */
  protected readonly menuKind = signal<'lingua' | 'velocidade'>('lingua');
  /** O número da frase no contador (no fim, a última; antes de tocar, a primeira). */
  protected readonly shownAt = computed(() => (this.voz.ended() ? this.voz.total() : Math.max(this.voz.at(), 0) + 1));
  protected readonly status = computed(() => {
    if (this.voz.ended()) return 'A nota acabou.';
    if (!this.voz.playing()) return 'Pausado.';
    return `Lendo em ${this.langName()}.`;
  });

  /** O menu: as três línguas (a sem voz neste navegador, apagada, dizendo por quê) e, lendo, as vozes da língua. */
  protected readonly menuSections = computed<MenuSections>(() => {
    if (this.menuKind() === 'velocidade') {
      const rate = this.voz.rate();
      return [VOICE_RATES.map((r) => ({ id: `r${r}`, label: rateName(r), icon: ICON.desempenho, on: r === rate, run: () => this.setRate(r) }))];
    }
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
    // o modo estudo: os rabiscos nas raízes lidas, na língua da leitura (a mesma folha guarda as reveladas;
    // a folha desenhada de novo, o modo sem spoilers, recomeça nela)
    effect(() => {
      const on = this.studying();
      const lang = this.voz.lang();
      const roots = this.roots().filter((r): r is HTMLElement => !!r);
      untracked(() => {
        if (!on || !lang || !roots.length) {
          if (this.estudo.on) this.estudo.stop();
          return;
        }
        const tag = VOICE_LANGS[lang].tag;
        if (this.estudo.has(roots)) this.estudo.refresh(tag);
        else this.estudo.start(roots, tag);
      });
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
        // o texto escondido (o modo sem spoilers) não se lê, e outra ficha no lugar não continua a leitura
        if (!this.roots().every(Boolean) || this.key() !== this.readingKey) {
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
    this.menuKind.set('lingua');
    this.openMenu(e, button, 'ouvir');
  }

  /** A velocidade: as seis à vista, a de agora com o tique. */
  protected chooseRate(e: MouseEvent, button: HTMLElement): void {
    this.menuKind.set('velocidade');
    this.openMenu(e, button, 'velocidade');
  }

  private openMenu(e: MouseEvent, button: HTMLElement, key: string): void {
    const menu = this.menu();
    if (menu.isOpenFor(key)) {
      menu.close(true);
      return;
    }
    // nada à mostra para ler no texto (o nome sozinho não conta): as línguas ficam apagadas, dizendo por quê
    if (key === 'ouvir') {
      const text = this.roots().slice(1).filter((r): r is HTMLElement => !!r);
      this.nothing.set(!sentencesOf(text, { lang: 'pt-BR', max: maxSpeech('pt-BR') }).length);
    }
    const r = button.getBoundingClientRect();
    // embaixo do botão; na fita, presa ao pé da tela, o menu vira para cima sozinho (sem lugar embaixo)
    menu.show({ key, x: r.left, y: r.bottom + 4, back: button, by: e.detail === 0 ? 'teclado' : 'mouse' });
  }

  /** Começa a ler na língua (ou troca a língua da leitura de agora, da frase onde estava). */
  private listen(lang: VoiceLang): void {
    const before = this.reading() ? this.list[this.voz.at()]?.text : undefined;
    const near = Math.max(this.voz.at(), 0);
    this.list = this.build(lang);
    if (!this.list.length) return;
    const from = before === undefined ? 0 : Math.max(findAgain(before, near, this.list), 0);
    this.readingKey = this.key();
    this.voz.start(this.list.map((s) => s.text), lang, from, this);
    this.watch();
    this.listenKeys();
    // os atalhos só servem com teclado: no computador (mouse fino), a dica aparece uma vez
    if (!this.voz.hintSeen('teclas') && typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches) this.showHint('teclas');
  }

  /** Mostra a dica de primeira vez por um tempo, e ela não volta neste aparelho. */
  private showHint(kind: VoiceHint): void {
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hint.set(kind);
    this.voz.markHint(kind);
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      this.hint.set(null);
    }, HINT_MS);
  }

  /** Os atalhos, enquanto a fita está à mostra: no documento, porque o foco pode estar solto na página. */
  private listenKeys(): void {
    if (this.unlistenKeys) return;
    const down = (e: KeyboardEvent) => this.onKey(e);
    const up = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !this.spaceDown) return;
      this.spaceDown = false;
      e.preventDefault();
    };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    this.unlistenKeys = () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
    };
  }

  /** Um atalho da fita: ← → a frase, Espaço pausa e continua, ↑ ↓ a velocidade (cada um como a tecla dele na chapa). */
  private onKey(e: KeyboardEvent): void {
    const action = KEYS[e.key];
    if (!action || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.isComposing || !this.reading()) return;
    if (!keysHere(e.target) || (action === 'play' && this.inText(e.target))) return;
    e.preventDefault();
    switch (action) {
      case 'play':
        this.spaceDown = true;
        if (!e.repeat) this.voz.toggle();
        return;
      case 'prev':
        if (this.voz.at() <= 0) return;
        this.press('prev');
        this.voz.prev();
        return;
      case 'next':
        if (this.voz.at() >= this.voz.total() - 1) return;
        this.press('next');
        this.voz.next();
        return;
      default: {
        const rate = this.voz.rate();
        const next = VOICE_RATES[VOICE_RATES.indexOf(rate) + (action === 'faster' ? 1 : -1)];
        if (next === undefined) {
          this.flashRate(false);
          this.say(`${rateName(rate)}: ${action === 'faster' ? 'a mais rápida' : 'a mais devagar'}.`);
          return;
        }
        this.flashRate(true);
        this.setRate(next);
        this.say(`Velocidade ${rateName(next)}.`);
      }
    }
  }

  /**
   * Um controle do texto com o foco (o card que fecha, o Copiar do código, o spoiler): o Espaço é dele. Os
   * botões da fita e da faixa não contam: quem clicou neles com o mouse e aperta Espaço quer pausar.
   */
  private inText(target: EventTarget | null): boolean {
    const control = target instanceof Element ? target.closest('a, button, summary, [role="button"], [role="link"]') : null;
    return !!control && this.roots().some((r) => r?.contains(control));
  }

  /**
   * A etiqueta da velocidade responde a ↑ ↓: acende e salta de leve com o número novo; na ponta, balança de
   * lado ("não dá mais"). Pelas animações da página, que recomeçam a cada tecla (uma classe não recomeçaria).
   */
  private flashRate(changed: boolean): void {
    const label = this.host.nativeElement.querySelector<HTMLElement>('.fita .velocidade');
    if (!label || typeof label.animate !== 'function') return;
    const still = reducedMotion();
    const frames: Keyframe[] = changed
      ? [{}, { offset: 0.35, background: '#fff', scale: still ? '1' : '1.1' }, {}]
      : still
        ? [{}, { offset: 0.4, background: '#fff' }, {}]
        : [{}, { translate: '-3px 0' }, { translate: '3px 0' }, { translate: '-2px 0' }, {}];
    label.animate(frames, { duration: changed ? 260 : 300, easing: 'ease-out' });
  }

  /** Liga ou desliga o modo estudo (fica guardado neste aparelho); o leitor de tela ouve o que mudou. */
  protected toggleStudy(): void {
    const on = !this.voz.study();
    this.voz.setStudy(on);
    if (on && !this.voz.hintSeen('estudo')) this.showHint('estudo');
    else if (!on && this.hint() === 'estudo') this.hint.set(null);
    this.say(on ? 'Modo estudo: o texto virou rabisco. Toque numa frase para vê-la, e de novo para escondê-la.' : 'O texto está à mostra de novo.');
  }

  private press(key: 'prev' | 'next'): void {
    if (this.pressTimer !== null) clearTimeout(this.pressTimer);
    this.pressed.set(key);
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.pressed.set(null);
    }, PRESS_MS);
  }

  private say(text: string): void {
    if (this.saidTimer !== null) clearTimeout(this.saidTimer);
    this.said.set(text);
    this.saidTimer = setTimeout(() => {
      this.saidTimer = null;
      this.said.set('');
    }, 2500);
  }

  /** Acaba a leitura desta fita (o X, a ficha que fecha). */
  stop(): void {
    if (untracked(this.voz.owner) === this) this.voz.stop();
    this.forget();
  }

  private forget(): void {
    this.list = [];
    this.estudo.stop();
    this.observer?.disconnect();
    this.observer = null;
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
    this.unwatchScroller?.();
    this.unwatchScroller = null;
    this.unlistenKeys?.();
    this.unlistenKeys = null;
    this.spaceDown = false;
    for (const t of [this.pressTimer, this.saidTimer, this.hintTimer]) if (t !== null) clearTimeout(t);
    this.pressTimer = this.saidTimer = this.hintTimer = null;
    this.hint.set(null);
    this.pressed.set(null);
    this.said.set('');
    // o marca-texto é um só na página: o de outra fita que lê agora fica (o título de um flashcard, que tomou a
    // voz, não pinta nada: o marca-texto desta sai)
    const other = untracked(this.voz.owner);
    if (typeof CSS !== 'undefined' && 'highlights' in CSS && !(other instanceof VozFita && other !== this)) {
      CSS.highlights.delete(VOICE_HIGHLIGHT);
      CSS.highlights.delete(VOICE_WORD_HIGHLIGHT);
    }
  }

  private build(lang: VoiceLang, rate = this.voz.rate()): Sentence[] {
    const tag = VOICE_LANGS[lang].tag;
    const roots = this.roots().filter((r): r is HTMLElement => !!r);
    return sentencesOf(roots, { lang: tag, max: maxSpeech(tag, rate) });
  }

  /** Troca a velocidade; lendo, as frases se partem de novo no tamanho dela, e a leitura segue de onde estava. */
  private setRate(rate: number): void {
    const lang = this.voz.lang();
    if (rate === this.voz.rate() || !lang || !this.reading()) {
      this.voz.setRate(rate);
      return;
    }
    const was = this.list[this.voz.at()]?.pieces[0];
    const next = this.build(lang, rate);
    const at = was ? sentenceAt(next, was.node, was.from) : -1;
    this.list = next;
    this.voz.setRate(rate, { texts: next.map((s) => s.text), at: Math.max(at, 0) });
    this.paint(this.voz.at(), this.voz.word());
  }

  /** Acompanha a nota que muda (o texto que a folha desenha de novo), o tocar numa frase e a mão que rola. */
  private watch(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      // os rabiscos do modo estudo desenhados de novo não são o texto mudando
      if (records.every((r) => this.estudo.owns(r.target) || (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every((n) => this.estudo.owns(n))))) return;
      if (this.estudo.on) this.estudo.refreshSoon();
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
    // no modo estudo, tocar no texto é para revelar (ui/voz-estudo.ts), não para mudar a frase lida
    if (e.defaultPrevented || e.button !== 0 || this.studying() || Date.now() - this.menuClosedAt < 400) return;
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
    // o nome da ficha fica na faixa, fora da folha que rola: a folha não volta ao alto por ele
    if (!first || !scroller.contains(first.startContainer)) return;
    const box = first.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const tape = this.host.nativeElement.querySelector('.fita')?.getBoundingClientRect().height ?? 0;
    if (box.top >= view.top + 24 && box.bottom <= view.bottom - tape - 24) return;
    this.autoUntil = Date.now() + 900;
    scroller.scrollBy({ top: box.top - view.top - scroller.clientHeight / 3, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}

/** "0,75×", "1×". */
function rateName(r: number): string {
  return `${String(r).replace('.', ',')}×`;
}

/**
 * O atalho vale aqui? Não onde a pessoa digita, num menu, nem numa folha aberta por cima da ficha
 * (comentários, compartilhar); na ficha aberta (as duas lado a lado também) e no foco solto na página, sim.
 */
function keysHere(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (el?.closest(TYPING) || el?.closest(OWN_KEYS)) return false;
  const sheet = el?.closest('dialog');
  if (sheet) return sheet.classList.contains('reader');
  try {
    return !document.querySelector('dialog:modal:not(.reader)');
  } catch {
    return true;
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
