'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { ArrowUp, Database, Loader2, Lock, RotateCcw } from 'lucide-react'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/lib/utils'
import { ChatMessage } from './ChatMessage'

const SUGGESTIONS = [
  '¿Cuáles son los productos más vendidos esta semana?',
  '¿Qué clientes compraron más este mes?',
  '¿Qué productos tienen inventario bajo?',
  '¿Cuál fue el total de facturación del último mes?',
]

export function ChatScreen() {
  const { messages, sendMessage, status, error, regenerate } = useChat()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const busy = status === 'submitted' || status === 'streaming'
  const isEmpty = messages.length === 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    sendMessage({ text: trimmed })
    setInput('')
  }

  return (
    <div className="flex h-dvh flex-col bg-background" data-chat-status={status}>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Database className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Copiloto de Datos del Negocio</h1>
          <p className="truncate text-xs text-muted-foreground">Preguntá en lenguaje natural sobre tu base de datos</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Lock className="size-3" /> Solo lectura
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
          {isEmpty ? (
            <EmptyState onPick={submit} disabled={busy} />
          ) : (
            messages.map((m) => <ChatMessage key={m.id} message={m} />)
          )}

          {status === 'submitted' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5 text-sm text-muted-foreground ring-1 ring-border">
                <Loader2 className="size-4 animate-spin" /> Pensando…
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{error?.message || 'Ocurrió un problema procesando tu pregunta.'}</span>
              <Button variant="outline" size="sm" onClick={() => regenerate()}>
                <RotateCcw className="size-3.5" /> Reintentar
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background px-4 py-3 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
          className="mx-auto flex w-full max-w-3xl items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(input)
              }
            }}
            rows={1}
            placeholder="Escribí tu pregunta sobre el negocio…"
            className={cn(
              'max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          />
          <Button type="submit" size="icon" className="h-11 w-11 rounded-xl" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            <span className="sr-only">Enviar</span>
          </Button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
          El copiloto solo lee datos: nunca modifica tu base de datos.
        </p>
      </div>
    </div>
  )
}

function EmptyState({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary">
        <Database className="size-7 text-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">¿Qué querés saber de tu negocio?</h2>
        <p className="text-sm text-muted-foreground">
          Preguntá en español. Yo traduzco a una consulta de solo lectura y te muestro la respuesta con su tabla.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
