'use client'

import { useState } from 'react'
import type { ToolUIPart } from 'ai'
import { ChevronDown, Database, Loader2, ShieldAlert, TriangleAlert } from 'lucide-react'
import { cn } from '@/core/lib/utils'
import type { ConsultaInput, ConsultaResult } from '../types/contracts'
import { ResultsTable } from './ResultsTable'

interface ToolCallCardProps {
  state: ToolUIPart['state']
  input?: Partial<ConsultaInput>
  output?: ConsultaResult
  errorText?: string
}

/** Muestra la consulta que ejecutó el agente + su resultado o error (estilo "Tool"). */
export function ToolCallCard({ state, input, output, errorText }: ToolCallCardProps) {
  const [open, setOpen] = useState(true)
  const running = state.startsWith('input') || state.startsWith('approval')
  const isError = state === 'output-error' || state === 'output-denied' || (output && output.ok === false)

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40"
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isError ? (
          <TriangleAlert className="size-3.5 text-destructive" />
        ) : (
          <Database className="size-3.5" />
        )}
        <span className="text-foreground">
          {running ? 'Consultando la base de datos…' : isError ? 'La consulta no se pudo completar' : 'Consulta ejecutada'}
        </span>
        <ChevronDown className={cn('ml-auto size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border">
          {input?.explicacion && (
            <p className="px-3 pt-2 text-xs text-muted-foreground">{input.explicacion}</p>
          )}
          {input?.sql && (
            <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
              <code>{input.sql}</code>
            </pre>
          )}

          {output?.ok === true && (
            <div className="border-t border-border">
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                {output.rowCount} fila{output.rowCount === 1 ? '' : 's'}
                {output.truncated ? ` (truncado a las primeras ${output.rowCount}; hay más)` : ''}
              </div>
              <ResultsTable columns={output.columns} rows={output.rows} />
            </div>
          )}

          {output?.ok === false && (
            <div className="flex items-start gap-2 border-t border-border px-3 py-2 text-xs text-destructive">
              {output.code === 'read_only' ? (
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{output.error}</span>
            </div>
          )}

          {state === 'output-error' && errorText && (
            <div className="flex items-start gap-2 border-t border-border px-3 py-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{errorText}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
