/**
 * Reads every row of a Supabase query in pages. PostgREST silently stops a single
 * answer at 1000 rows, so a list or a total built from one plain `select` is
 * wrong without any error once the table grows past that.
 *
 *   const rows = await fetchAllRows<Row>((from, to) =>
 *     supabase.from('opportunities').select('id, status').order('created_at').range(from, to));
 */

const PAGE_SIZE = 1000;

interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
