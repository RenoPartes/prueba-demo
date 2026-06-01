'use client'

import { useState } from 'react'
import { isToolUIPart, type UIMessage } from 'ai'
import { Brain, ChevronDown } from 'lucide-react'
import { cn } from '@/core/lib/utils'
import type { ConsultaInput, ConsultaResult } from '../types/contracts'
import { MarkdownResponse } from './MarkdownResponse'
import { ToolCallCard } from './ToolCallCard'

function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className="size-3.5" />
        Razonamiento
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <p className="mt-1 border-l-2 border-border pl-3 text-xs italic text-muted-foreground">{text}</p>
      )}
    </div>
  )
}

export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div
      data-role={message.role}
      className={cn('flex animate-fade-in', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-4 py-2.5 sm:max-w-[80%]',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-card-foreground ring-1 ring-border',
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return isUser ? (
              <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                {part.text}
              </p>
            ) : (
              <MarkdownResponse key={i}>{part.text}</MarkdownResponse>
            )
          }
          if (part.type === 'reasoning') {
            return <ReasoningBlock key={i} text={part.text} />
          }
          if (isToolUIPart(part)) {
            return (
              <ToolCallCard
                key={i}
                state={part.state}
                input={part.input as Partial<ConsultaInput> | undefined}
                output={part.output as ConsultaResult | undefined}
                errorText={part.errorText}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
