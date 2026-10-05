import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  BookOpen,
  Check,
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  Film,
  Gamepad2,
  LucideAngularModule,
  Origami,
  ShieldAlert,
  TriangleAlert,
  Tv,
  Upload,
  X,
} from 'lucide-angular';
import { BACKUP_EVERY_DAYS, Backup } from '../core/backup';
import { ReviewStore } from '../core/review-store';
import { ScoreDisplay, Settings } from '../core/settings';
import { Toasts } from '../ui/toast';
import { Pin } from '../ui/pin';
import { BonusSticker } from '../ui/bonus';
import { JudgeLabel } from '../ui/judge-label';
import { Bonus } from '../core/review';
import { scramble } from '../core/spoiler';
import { Rabisco } from '../ui/rabisco';

const DAY = 86_400_000;

/**
 * Ajustes: três fichas pregadas. Backup (azul) e Mural (verde) numa coluna, Busca e capas (lilás) na
 * outra, para nenhuma deixar um buraco na parede. Toda escolha é o adesivo da cartela, como no editor:
 * a não escolhida é o recorte picotado, a escolhida sai colada. Nada aqui tem botão de salvar: vale na hora.
 */
@Component({
  selector: 'app-settings-page',
  imports: [LucideAngularModule, Pin, BonusSticker, JudgeLabel, Rabisco],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h1 class="tape-label big">Ajustes</h1>
      <p class="resumo">Vale na hora e fica salvo neste navegador</p>
    </header>

    <div class="boards">
      <!-- ===== Backup ===== -->
      <section class="ficha cartolina backup" aria-labelledby="backup-titulo">
        <app-pin class="pin" color="#e62e2d" />
        <h2 id="backup-titulo">Backup</h2>
        <p class="lead">
          Suas resenhas moram só neste navegador. O backup é um arquivo com todos os murais: resenhas, pra depois e
          wishlist.
        </p>

        <div class="estado" [class.atrasado]="overdue()">
          <lucide-icon
            class="estado-icone"
            [img]="overdue() ? AlertIcon : OkIcon"
            [size]="22"
            [strokeWidth]="2.4"
            aria-hidden="true"
          />
          <div>
            <p class="estado-linha">{{ lastBackup() }}</p>
            <p class="estado-sub">{{ contents() }}</p>
          </div>
        </div>

        <button type="button" class="btn-ink baixar" (click)="exportFile()" [disabled]="!hasData()">
          <lucide-icon [img]="DownloadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
          Baixar backup
        </button>

        @if (backup.persisted() === false) {
          <p class="tip">
            <lucide-icon [img]="ShieldIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
            <span>
              O navegador pode apagar o que um site guarda quando falta espaço (o Safari apaga depois de uma semana sem
              abrir). Instale o mural na tela inicial para ele ficar protegido.
            </span>
          </p>
        }

        <div class="bloco" role="group" aria-labelledby="restaurar-titulo">
          <h3 id="restaurar-titulo" class="sub">Restaurar um backup</h3>
          <fieldset class="escolha">
            <legend class="rotulo">O que fazer com o que já está aqui?</legend>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="modo" value="merge" [checked]="mode() === 'merge'" (change)="mode.set('merge')" />
                <span class="adesivo" [class.recorte]="mode() !== 'merge'" [class.colado]="mode() === 'merge'">Juntar</span>
              </span>
              <span class="op-texto">Soma o arquivo ao que já está aqui. Se uma resenha está nos dois, fica a mais nova.</span>
            </label>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="modo" value="replace" [checked]="mode() === 'replace'" (change)="mode.set('replace')" />
                <span class="adesivo" [class.recorte]="mode() !== 'replace'" [class.colado]="mode() === 'replace'">Substituir</span>
              </span>
              <span class="op-texto">Apaga o que está aqui e deixa os murais iguais ao arquivo.</span>
            </label>
          </fieldset>
          <label class="file-btn">
            <lucide-icon [img]="UploadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
            {{ mode() === 'replace' ? 'Escolher arquivo e substituir' : 'Escolher arquivo e juntar' }}
            <input type="file" accept="application/json,.json,application/gzip,.gz" (change)="importFile($event)" />
          </label>
          <p class="hint">O arquivo .json ou .json.gz baixado aqui, em qualquer navegador.</p>
          @if (importMsg(); as m) {
            <p class="msg" [class.error]="m.error" role="status">{{ m.text }}</p>
          }
        </div>
      </section>

      <!-- ===== Mural ===== -->
      <section class="ficha cartolina mural" aria-labelledby="mural-titulo">
        <app-pin class="pin" color="#e62e2d" />
        <h2 id="mural-titulo">Mural</h2>
        <fieldset class="escolha">
          <legend class="rotulo">Etiquetas dos grupos</legend>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="etiquetas" value="mostrar" [checked]="settings.groupLabels()" (change)="settings.groupLabels.set(true)" />
              <span class="adesivo" [class.recorte]="!settings.groupLabels()" [class.colado]="settings.groupLabels()">Mostrar</span>
            </span>
            <span class="op-texto">Uma fita separa cada grupo pelo que ordena: mês, nota, letra ou status.</span>
          </label>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="etiquetas" value="esconder" [checked]="!settings.groupLabels()" (change)="settings.groupLabels.set(false)" />
              <span class="adesivo" [class.recorte]="settings.groupLabels()" [class.colado]="!settings.groupLabels()">Esconder</span>
            </span>
            <span class="op-texto">As fichas correm juntas, sem nada no meio. Bom para tirar print.</span>
          </label>
        </fieldset>

        <!-- um pedaço da parede, para ver o efeito antes de voltar ao mural -->
        <div class="previa parede" [class.junta]="!settings.groupLabels()" aria-hidden="true">
          @for (g of preview; track g.label) {
            <div class="p-grupo">
              @if (settings.groupLabels()) {
                <span class="p-fita">{{ g.label }}</span>
              }
              <div class="p-fichas">
                @for (s of g.stocks; track $index) {
                  <span class="p-ficha" [style.--stock]="'var(--stock-' + s + ')'"></span>
                }
              </div>
            </div>
          }
        </div>

        <fieldset class="escolha spoilers">
          <legend class="rotulo">Spoilers</legend>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="spoilers" value="mostrar" [checked]="!settings.noSpoilers()" (change)="settings.noSpoilers.set(false)" />
              <span class="adesivo" [class.recorte]="settings.noSpoilers()" [class.colado]="!settings.noSpoilers()">Mostrar</span>
            </span>
            <span class="op-texto">As fichas mostram o que você achou: notas, veredito, bônus e a frase da resenha.</span>
          </label>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="spoilers" value="esconder" [checked]="settings.noSpoilers()" (change)="settings.noSpoilers.set(true)" />
              <span class="adesivo" [class.recorte]="!settings.noSpoilers()" [class.colado]="settings.noSpoilers()">Sem spoilers</span>
            </span>
            <span class="op-texto">
              Toda nota vira “?”, o veredito vira “Segredo”, as horas e a dificuldade somem, todo bônus fica meio branco e meio preto, e o texto vira um rabisco do mesmo tamanho, como letreiro de desenho animado.
              Bom para mostrar o mural sem contar nada.
            </span>
          </label>
        </fieldset>

        <fieldset class="escolha nota">
          <legend class="rotulo">Nota</legend>
          @for (o of scoreDisplays; track o.value) {
            <label class="op">
              <span class="opcao">
                <input type="radio" name="nota" [value]="o.value" [checked]="settings.scoreDisplay() === o.value" (change)="settings.scoreDisplay.set(o.value)" />
                <span class="adesivo" [class.recorte]="settings.scoreDisplay() !== o.value" [class.colado]="settings.scoreDisplay() === o.value">{{ o.label }}</span>
              </span>
              <span class="op-texto">{{ o.text }}</span>
            </label>
          }
        </fieldset>

        <!-- um canto de ficha, para ver o que some e como a nota aparece -->
        <div class="previa-ficha" aria-hidden="true">
          <app-judge-label class="p-julgamento" [value]="8.7" verdict="recomendo" size="compact" [masked]="settings.noSpoilers()" />
          <ul class="p-bonus">
            @for (b of sampleBonuses; track b.id; let i = $index) {
              <li><app-bonus-sticker [bonus]="b" [index]="i" size="mini" [masked]="settings.noSpoilers()" seed="previa" /></li>
            }
          </ul>
          <p class="p-frase">
            @if (settings.noSpoilers()) {
              “<app-rabisco [text]="sampleLeadMasked" />”
            } @else {
              “{{ sampleLead }}”
            }
          </p>
        </div>
      </section>

      <!-- ===== Busca e capas ===== -->
      <section class="ficha cartolina catalog" aria-labelledby="catalogo-titulo">
        <app-pin class="pin" color="#f4f4f0" />
        <h2 id="catalogo-titulo">Busca e capas</h2>
        <p class="lead">A busca já funciona sem configurar nada. Duas chaves gratuitas deixam ela melhor.</p>

        <h3 class="rotulo fontes-titulo" id="fontes-titulo">De onde vem a busca agora</h3>
        <dl class="fontes" aria-labelledby="fontes-titulo">
          <div>
            <dt><lucide-icon [img]="GamesIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Jogos</dt>
            <dd>
              @if (settings.effectiveSource() === 'rawg') {
                RAWG <span class="via">com capa da Steam</span>
              } @else {
                Wikipedia <span class="via">em inglês</span>
              }
            </dd>
          </div>
          <div>
            <dt><lucide-icon [img]="BooksIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Livros</dt>
            <dd>Open Library <span class="via">edição em português</span></dd>
          </div>
          <div>
            <dt>
              <lucide-icon [img]="FilmsIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
              <lucide-icon [img]="SeriesIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Filmes e séries
            </dt>
            <dd>
              @if (settings.hasTmdb()) {
                TMDB <span class="via">em português</span>
              } @else {
                Wikipedia <span class="via">em inglês</span>
              }
            </dd>
          </div>
          <div>
            <dt><lucide-icon [img]="AnimesIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Animes</dt>
            <dd>Kitsu <span class="via">nome brasileiro quando tem</span></dd>
          </div>
        </dl>

        <!-- TMDB -->
        <section class="chave" aria-labelledby="tmdb-titulo">
          <div class="chave-topo">
            <h3 id="tmdb-titulo" class="sub">Chave do TMDB</h3>
            <span class="selo" [class.ok]="settings.hasTmdb()">
              @if (settings.hasTmdb()) {
                <lucide-icon [img]="CheckIcon" [size]="14" [strokeWidth]="3" aria-hidden="true" />
                Chave salva
              } @else {
                Sem chave
              }
            </span>
          </div>
          <p class="ganho">Filmes e séries com o nome e o pôster em português.</p>
          <ol class="passos">
            <li>
              Crie uma conta grátis em
              <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org</a>.
            </li>
            <li>Peça uma chave de API para uso pessoal.</li>
            <li>Cole aqui a "Chave da API" ou o "Token de leitura".</li>
          </ol>
          <div class="key">
            <input
              #tmdbInput
              id="tmdb-key"
              aria-labelledby="tmdb-titulo"
              [type]="showTmdb() ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="Cole sua chave do TMDB"
              [value]="settings.tmdbKey()"
              (input)="settings.tmdbKey.set($any($event.target).value)"
            />
            @if (settings.tmdbKey()) {
              <button type="button" class="icon-btn" (click)="settings.tmdbKey.set(''); tmdbInput.focus()" aria-label="Apagar a chave do TMDB">
                <lucide-icon [img]="ClearIcon" [size]="20" [strokeWidth]="2.6" />
              </button>
            }
            <button
              type="button"
              class="icon-btn"
              (click)="showTmdb.set(!showTmdb())"
              [attr.aria-label]="showTmdb() ? 'Esconder chave' : 'Mostrar chave'"
              [attr.aria-pressed]="showTmdb()"
            >
              <lucide-icon [img]="showTmdb() ? HideIcon : ShowIcon" [size]="20" [strokeWidth]="2.4" />
            </button>
          </div>
          <p class="credit">Este site usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p>
        </section>

        <!-- RAWG -->
        <section class="chave" aria-labelledby="rawg-titulo">
          <div class="chave-topo">
            <h3 id="rawg-titulo" class="sub">Chave da RAWG</h3>
            <span class="selo" [class.ok]="settings.hasRawg()">
              @if (settings.hasRawg()) {
                <lucide-icon [img]="CheckIcon" [size]="14" [strokeWidth]="3" aria-hidden="true" />
                Chave salva
              } @else {
                Sem chave
              }
            </span>
          </div>
          <p class="ganho">Busca de jogos mais precisa, e a capa vertical da Steam quando o jogo está lá.</p>
          <ol class="passos">
            <li>
              Crie uma chave grátis em
              <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a>.
            </li>
            <li>Cole a chave aqui.</li>
          </ol>
          <div class="key">
            <input
              #rawgInput
              id="rawg-key"
              aria-labelledby="rawg-titulo"
              [type]="showKey() ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="Cole sua chave da RAWG"
              [value]="settings.rawgKey()"
              (input)="settings.rawgKey.set($any($event.target).value)"
            />
            @if (settings.rawgKey()) {
              <button type="button" class="icon-btn" (click)="settings.rawgKey.set(''); rawgInput.focus()" aria-label="Apagar a chave da RAWG">
                <lucide-icon [img]="ClearIcon" [size]="20" [strokeWidth]="2.6" />
              </button>
            }
            <button
              type="button"
              class="icon-btn"
              (click)="showKey.set(!showKey())"
              [attr.aria-label]="showKey() ? 'Esconder chave' : 'Mostrar chave'"
              [attr.aria-pressed]="showKey()"
            >
              <lucide-icon [img]="showKey() ? HideIcon : ShowIcon" [size]="20" [strokeWidth]="2.4" />
            </button>
          </div>

          <fieldset class="escolha fonte">
            <legend class="rotulo">Buscar jogos e capas de jogos em</legend>
            <label class="op">
              <span class="opcao">
                <input
                  type="radio"
                  name="fonte"
                  value="wikipedia"
                  [checked]="settings.effectiveSource() === 'wikipedia'"
                  (change)="settings.source.set('wikipedia')"
                />
                <span class="adesivo" [class.recorte]="settings.effectiveSource() !== 'wikipedia'" [class.colado]="settings.effectiveSource() === 'wikipedia'">
                  Wikipedia
                </span>
              </span>
              <span class="op-texto">Não precisa de chave.</span>
            </label>
            <label class="op" [class.off]="!settings.hasRawg()">
              <span class="opcao">
                <input
                  type="radio"
                  name="fonte"
                  value="rawg"
                  [disabled]="!settings.hasRawg()"
                  [checked]="settings.effectiveSource() === 'rawg'"
                  (change)="settings.source.set('rawg')"
                />
                <span class="adesivo" [class.recorte]="settings.effectiveSource() !== 'rawg'" [class.colado]="settings.effectiveSource() === 'rawg'">
                  RAWG
                </span>
              </span>
              <span class="op-texto">
                @if (settings.hasRawg()) {
                  Usa a sua chave, e traz a capa da Steam.
                } @else {
                  Cole a chave acima para usar.
                }
              </span>
            </label>
          </fieldset>
        </section>
      </section>
    </div>
  `,
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly store = inject(ReviewStore);
  protected readonly settings = inject(Settings);
  /** O jeito de mostrar a nota, com um exemplo de cada. */
  protected readonly scoreDisplays: readonly { value: ScoreDisplay; label: string; text: string }[] = [
    { value: 'livre', label: 'Livre', text: 'Qualquer nota com até uma casa: 8,4 fica 8,4.' },
    { value: 'metade', label: 'Arredondado', text: 'Vai para a metade ou o inteiro mais perto: 9,2 vira 9 e 8,4 vira 8,5.' },
    { value: 'inteiro', label: 'Inteiros', text: 'Vai para o inteiro mais perto: 8,4 vira 8 e 8,5 vira 9.' },
  ];
  protected readonly backup = inject(Backup);
  private readonly toasts = inject(Toasts);

  protected readonly DownloadIcon = Download;
  protected readonly UploadIcon = Upload;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly ClearIcon = X;
  protected readonly CheckIcon = Check;
  protected readonly OkIcon = CircleCheck;
  protected readonly AlertIcon = TriangleAlert;
  protected readonly ShieldIcon = ShieldAlert;
  protected readonly GamesIcon = Gamepad2;
  protected readonly BooksIcon = BookOpen;
  protected readonly FilmsIcon = Film;
  protected readonly SeriesIcon = Tv;
  protected readonly AnimesIcon = Origami;

  /** O pedaço de parede da prévia das etiquetas: dois meses, cinco fichas. */
  protected readonly preview = [
    { label: 'Março', stocks: ['rosa', 'azul', 'verde'] },
    { label: 'Fevereiro', stocks: ['amarelo', 'laranja'] },
  ];

  /** A prévia do modo sem spoilers: dois bônus, um de cada lado, e uma frase de resenha. */
  protected readonly sampleBonuses: Bonus[] = [
    { id: 'trilha-sonora', label: 'Trilha sonora incrível', kind: 'favor' },
    { id: 'bugs', label: 'Muitos bugs', kind: 'contra' },
  ];
  protected readonly sampleLead = 'Valeu cada hora, mesmo com o final corrido.';
  protected readonly sampleLeadMasked = scramble(this.sampleLead, 'previa');

  protected readonly showKey = signal(false);
  protected readonly showTmdb = signal(false);
  protected readonly mode = signal<'merge' | 'replace'>('merge');
  protected readonly importMsg = signal<{ text: string; error: boolean } | null>(null);

  private readonly wishCount = computed(() => this.store.wishes().length);
  protected readonly hasData = computed(() => this.store.count() > 0 || this.store.draftCount() > 0 || this.wishCount() > 0);

  /** Dias desde o último backup (null: nunca baixou). */
  private readonly daysSince = computed(() => {
    const at = this.backup.lastAt();
    return at ? Math.max(0, Math.floor((Date.now() - Date.parse(at)) / DAY)) : null;
  });

  /** Mesmo critério do bilhete em cima do mural: passou do prazo, ou nunca baixou e já tem o que guardar. */
  protected readonly overdue = computed(() => {
    const d = this.daysSince();
    return this.hasData() && (d === null || d >= BACKUP_EVERY_DAYS);
  });

  protected readonly lastBackup = computed(() => {
    const d = this.daysSince();
    if (d === null) return 'Nenhum backup baixado ainda';
    const when = d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
    return this.overdue() ? `Último backup: ${when}. Hora de baixar outro.` : `Último backup: ${when}`;
  });

  /** O que entra no arquivo, contado. */
  protected readonly contents = computed(() => {
    const n = this.store.count();
    const drafts = this.store.draftCount();
    const wishes = this.wishCount();
    if (!n && !drafts && !wishes) return 'Ainda não há nada para guardar.';
    const parts = [`${n} ${n === 1 ? 'resenha' : 'resenhas'}`];
    if (drafts) parts.push(`${drafts} pra depois`);
    if (wishes) parts.push(`${wishes} na wishlist`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
    return `O arquivo leva ${list}.`;
  });

  protected exportFile(): Promise<void> {
    return this.backup.download();
  }

  protected async importFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const n = this.store.count();
    if (
      this.mode() === 'replace' &&
      n > 0 &&
      !confirm(
        `Substituir pelo backup? ${n === 1 ? 'A resenha que está aqui sai' : `As ${n} resenhas que estão aqui saem`} e os murais ficam iguais ao arquivo.`,
      )
    ) {
      return;
    }
    try {
      const res = this.store.importJson(await this.store.readBackup(file), this.mode());
      const parts = [`${res.added} ${res.added === 1 ? 'resenha nova' : 'resenhas novas'}`];
      if (res.updated) parts.push(`${res.updated} atualizada${res.updated === 1 ? '' : 's'}`);
      if (res.skipped) parts.push(`${res.skipped} ignorada${res.skipped === 1 ? '' : 's'}`);
      if (res.removed) parts.push(`${res.removed} ${res.removed === 1 ? 'apagada' : 'apagadas'} como no backup`);
      if (res.drafts) parts.push(`${res.drafts} ${res.drafts === 1 ? 'jogo' : 'jogos'} pra depois`);
      if (res.wishes) parts.push(`${res.wishes} na wishlist`);
      this.importMsg.set({ text: `Backup restaurado: ${parts.join(', ')}.`, error: false });
      const total = res.added + res.updated;
      if (total) this.toasts.show(`${total} ${total === 1 ? 'resenha voltou' : 'resenhas voltaram'} para os murais`);
    } catch (err) {
      this.importMsg.set({ text: (err as Error).message, error: true });
    }
  }
}
