import { openai } from '@ai-sdk/openai'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai'
import { getOpenAIConfig } from '@/core/config/env'
import { consultarBaseDeDatos } from '@/features/chat/services/consultar-tool'
import {
  buildFallbackSystemPrompt,
  buildSystemPrompt,
} from '@/features/chat/services/system-prompt'

// oracledb requiere runtime Node (no Edge). El agente puede tardar varios pasos.
export const runtime = 'nodejs'
export const maxDuration = 60

/** Emite un único mensaje de asistente con texto plano (para errores de configuración). */
function plainMessage(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = 'aviso'
      writer.write({ type: 'text-start', id })
      writer.write({ type: 'text-delta', id, delta: text })
      writer.write({ type: 'text-end', id })
    },
  })
  return createUIMessageStreamResponse({ stream })
}

export async function POST(req: Request): Promise<Response> {
  let body: { messages?: UIMessage[] }
  try {
    body = await req.json()
  } catch {
    return new Response('Petición inválida.', { status: 400 })
  }
  const messages = body.messages ?? []

  // Sin OpenAI no hay agente: respondemos con un aviso claro (la app no crashea).
  const openaiCfg = getOpenAIConfig()
  if (!openaiCfg.ok) {
    return plainMessage(
      `Todavía no puedo pensar las respuestas porque falta configurar ${openaiCfg.missing.join(', ')} en el archivo .env.local. En cuanto esté la clave de OpenAI, vuelvo a estar listo para responder tus preguntas.`,
    )
  }

  // El esquema alimenta el system prompt; si la BD no responde, seguimos con un
  // prompt de respaldo para que el modelo explique con gracia que no hay conexión.
  let system: string
  try {
    system = await buildSystemPrompt()
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'desconocido'
    system = buildFallbackSystemPrompt(reason)
  }

  const result = streamText({
    model: openai(openaiCfg.model),
    system,
    messages: await convertToModelMessages(messages),
    tools: { consultarBaseDeDatos },
    stopWhen: stepCountIs(8),
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error)
      // Mensaje de configuración típico cuando la API key es inválida.
      if (/api key|apikey|401|unauthorized/i.test(msg)) {
        return 'Hubo un problema con la clave de OpenAI. Revisá OPENAI_API_KEY en .env.local.'
      }
      if (/model|gpt-5\.5|not found|404|does not exist/i.test(msg)) {
        return 'No pude usar el modelo configurado. Revisá OPENAI_MODEL en .env.local (por defecto gpt-5.5).'
      }
      return 'Ocurrió un problema procesando tu pregunta. Intentá de nuevo en un momento.'
    },
  })
}
