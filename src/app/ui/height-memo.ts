/**
 * As alturas já medidas nesta visita (o tipo de ficha + o id), para a vaga da ficha que voltou a ser vaga,
 * ou da parede aberta de novo, ter a altura certa: a página não muda de tamanho quando ela é montada outra
 * vez. Sem a medida dela, a média das do mesmo tipo; sem nenhuma, o palpite de quem pergunta. Valem para a
 * largura de janela em que foram medidas.
 */
export class HeightMemo<K extends string = string> {
  private readonly seen = new Map<string, number>();
  private readonly mean = new Map<K, { sum: number; n: number }>();
  private seenAt = 0;

  private fresh(): void {
    const w = typeof innerWidth === 'number' ? innerWidth : 0;
    if (w === this.seenAt) return;
    this.seenAt = w;
    this.seen.clear();
    this.mean.clear();
  }

  remember(kind: K, id: string, height: number): void {
    if (height <= 0) return;
    this.fresh();
    const key = `${kind}|${id}`;
    const before = this.seen.get(key);
    this.seen.set(key, height);
    const m = this.mean.get(kind) ?? { sum: 0, n: 0 };
    m.sum += height - (before ?? 0);
    if (before === undefined) m.n++;
    this.mean.set(kind, m);
  }

  height(kind: K, id: string, guess: number): number {
    this.fresh();
    const known = this.seen.get(`${kind}|${id}`);
    if (known) return known;
    const m = this.mean.get(kind);
    return m?.n ? Math.round(m.sum / m.n) : guess;
  }

  /** Esta ficha já foi medida. */
  knows(kind: K, id: string): boolean {
    return this.seen.has(`${kind}|${id}`);
  }

  /** Alguma ficha deste tipo já foi medida. */
  measured(kind: K): boolean {
    return !!this.mean.get(kind)?.n;
  }

  forget(): void {
    this.seen.clear();
    this.mean.clear();
    this.seenAt = 0;
  }
}
