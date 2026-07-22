/**
 * supabase-js query builder'ının servislerde KULLANILAN alt kümesini taklit eden
 * bellek-içi sahte istemci. Gerçek DB'ye ihtiyaç duymadan, filtreleri (eq/gte/lt)
 * gerçekten uygulayarak tenant izolasyonunu ve dedup mantığını doğrulamayı sağlar.
 *
 * Desteklenen zincir: from().select().eq().gte().lt().order().single() ve
 * await (thenable) ile dizi sonucu; ayrıca insert().select().single().
 */

export type Row = Record<string, any>;
export interface FakeResult<T = any> {
  data: T | null;
  error: { message: string } | null;
}

export interface FakeDataset {
  hotels?: Row[];
  widget_events?: Row[];
  users?: Row[];
  [table: string]: Row[] | undefined;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake-${idCounter.toString().padStart(6, '0')}`;
}

class FakeQueryBuilder implements PromiseLike<FakeResult<Row[]>> {
  private eqFilters: { col: string; val: unknown }[] = [];
  private gteFilters: { col: string; val: string }[] = [];
  private ltFilters: { col: string; val: string }[] = [];
  private orderBy: { col: string; ascending: boolean }[] = [];
  private insertedRows: Row[] | null = null;

  private insertError: { code: string; message: string } | null = null;

  constructor(
    private readonly table: string,
    private readonly store: FakeDataset,
    private readonly uniqueBy?: string[],
  ) {}

  select(_cols?: string): this {
    return this;
  }

  eq(col: string, val: unknown): this {
    this.eqFilters.push({ col, val });
    return this;
  }

  gte(col: string, val: string): this {
    this.gteFilters.push({ col, val });
    return this;
  }

  lt(col: string, val: string): this {
    this.ltFilters.push({ col, val });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  insert(row: Row | Row[]): this {
    const rows = Array.isArray(row) ? row : [row];
    const existing = this.store[this.table] ?? [];

    // Unique constraint taklidi: uniqueBy anahtarları null İÇERMEYEN satırlar
    // çakışırsa 23505 (Postgres NULL-distinct + partial index semantiği).
    if (this.uniqueBy) {
      for (const r of rows) {
        const keys = this.uniqueBy;
        const anyNull = keys.some((k) => r[k] === null || r[k] === undefined);
        if (!anyNull) {
          const clash = existing.some((e) =>
            keys.every((k) => e[k] === r[k]),
          );
          if (clash) {
            this.insertError = { code: '23505', message: 'duplicate key' };
            return this;
          }
        }
      }
    }

    const full = rows.map((r) => ({
      id: nextId(),
      created_at: new Date().toISOString(),
      ...r,
    }));
    (this.store[this.table] ??= []).push(...full);
    this.insertedRows = full;
    return this;
  }

  private pendingUpdate: Row | null = null;

  update(patch: Row): this {
    this.pendingUpdate = patch;
    return this;
  }

  private resolveRows(): Row[] {
    if (this.insertedRows) return this.insertedRows;

    // update: eq filtreleriyle eşleşen satırları yerinde güncelle, onları dön.
    if (this.pendingUpdate) {
      const target = (this.store[this.table] ?? []).filter((r) =>
        this.eqFilters.every((f) => r[f.col] === f.val),
      );
      for (const r of target) Object.assign(r, this.pendingUpdate);
      return target;
    }

    let rows = [...(this.store[this.table] ?? [])];
    for (const f of this.eqFilters) {
      rows = rows.filter((r) => r[f.col] === f.val);
    }
    for (const f of this.gteFilters) {
      rows = rows.filter((r) => String(r[f.col]) >= f.val);
    }
    for (const f of this.ltFilters) {
      rows = rows.filter((r) => String(r[f.col]) < f.val);
    }
    for (const o of [...this.orderBy].reverse()) {
      rows.sort((a, b) => {
        const av = String(a[o.col] ?? '');
        const bv = String(b[o.col] ?? '');
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return o.ascending ? cmp : -cmp;
      });
    }
    return rows;
  }

  /** supabase .single(): 0 satır -> error, aksi halde ilk satır. */
  async single(): Promise<FakeResult<Row>> {
    if (this.insertError) return { data: null, error: this.insertError };
    const rows = this.resolveRows();
    if (rows.length === 0) {
      return { data: null, error: { message: 'Row not found' } };
    }
    return { data: rows[0], error: null };
  }

  // Thenable: `await builder` -> { data: Row[], error: null }
  then<TResult1 = FakeResult<Row[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResult<Row[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result: FakeResult<Row[]> = this.insertError
      ? { data: null, error: this.insertError }
      : { data: this.resolveRows(), error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabase {
  db: { from(table: string): FakeQueryBuilder };
  dataset: FakeDataset;
  getUserFromToken: (
    token: string,
  ) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
}

export interface FakeOptions {
  /** Tablo başına unique anahtar kolonları (idempotency/23505 taklidi). */
  uniqueBy?: Record<string, string[]>;
}

/** Sahte SupabaseService (servislere `as any` ile enjekte edilir). */
export function makeFakeSupabase(
  dataset: FakeDataset = {},
  options: FakeOptions = {},
): FakeSupabase {
  return {
    dataset,
    db: {
      from(table: string) {
        return new FakeQueryBuilder(table, dataset, options.uniqueBy?.[table]);
      },
    },
    getUserFromToken: (_token: string) =>
      Promise.resolve({ data: { user: null }, error: null }),
  };
}
