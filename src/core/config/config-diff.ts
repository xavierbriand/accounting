export interface ChangedEntry {
  readonly key: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly previous?: string;
  readonly current?: string;
}

export interface ChangedSection {
  readonly section: string;
  readonly entries: readonly ChangedEntry[];
}
