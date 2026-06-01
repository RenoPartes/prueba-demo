/** Renderiza filas crudas devueltas por el tool como una tabla compacta. */
export function ResultsTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Sin filas.</p>
  }
  const cols = columns.length > 0 ? columns : Object.keys(rows[0])

  return (
    <div className="max-h-80 w-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-secondary">
          <tr>
            {cols.map((c) => (
              <th key={c} className="border-b border-border px-3 py-1.5 text-left font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="even:bg-secondary/30">
              {cols.map((c) => (
                <td key={c} className="border-b border-border/60 px-3 py-1.5 align-top tabular-nums">
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
