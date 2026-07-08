import type { LineItem } from '@core/transfer/line-item.js';

export class LineItemKey {
  private constructor(
    public readonly kind: LineItem['kind'],
    public readonly category: string,
    public readonly description: string,
  ) {}

  static of(item: LineItem): LineItemKey {
    return new LineItemKey(item.kind, item.category, item.description);
  }

  equals(other: LineItemKey): boolean {
    return (
      this.kind === other.kind &&
      this.category === other.category &&
      this.description === other.description
    );
  }

  compare(other: LineItemKey): number {
    if (this.kind !== other.kind) return this.kind < other.kind ? -1 : 1;
    if (this.category !== other.category) return this.category < other.category ? -1 : 1;
    if (this.description !== other.description) return this.description < other.description ? -1 : 1;
    return 0;
  }

  toString(): string {
    return `${this.kind}|${this.category}|${this.description}`;
  }
}
