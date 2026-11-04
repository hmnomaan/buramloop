// client/src/components/ui/DataTable.tsx
import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';

export interface DataTableColumn<TRow> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: TRow) => React.ReactNode;
}

export function DataTable<TRow extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  searchPlaceholder = 'Filter table rows...',
  emptyMessage = 'No operational records match the current filter.',
}: {
  columns: DataTableColumn<TRow>[];
  data: TRow[];
  rowKey: (row: TRow) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? data.filter((row) =>
          Object.values(row).some((val) =>
            String(val ?? '')
              .toLowerCase()
              .includes(q)
          )
        )
      : [...data];

    if (sortKey) {
      base.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortAsc ? av - bv : bv - av;
        }
        return sortAsc
          ? String(av ?? '').localeCompare(String(bv ?? ''))
          : String(bv ?? '').localeCompare(String(av ?? ''));
      });
    }
    return base;
  }, [data, query, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="bg-buram-surface border border-buram-border rounded-lg shadow-panel overflow-hidden">
      <div className="p-3 border-b border-buram-border flex items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="w-3.5 h-3.5 text-buram-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-buram-bg border border-buram-border rounded pl-8 pr-3 py-1.5 text-xs font-mono text-buram-text placeholder-buram-muted/60 focus:border-buram-amber"
          />
        </div>
        <span className="text-[11px] font-mono text-buram-muted tabular-nums">
          {filteredData.length} / {data.length} RECORDS
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
          <thead>
            <tr className="border-b border-buram-border bg-buram-bg/50 text-buram-muted uppercase text-[11px]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-2.5 px-3 select-none cursor-pointer hover:text-buram-text ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    <ArrowUpDown className="w-3 h-3 opacity-50" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-buram-border/50">
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 text-center text-buram-muted font-mono text-xs"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredData.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-buram-elevated/40">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2.5 px-3 ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}