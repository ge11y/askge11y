import { NextRequest, NextResponse } from 'next/server'
import { embedText } from '@/lib/gemini'
import { chat } from '@/lib/groq'
import { getServiceClient } from '@/lib/supabase'
import { GELLY_SYSTEM_PROMPT } from '@/lib/gelly-prompt'

// Tier 1: Gelly's actual spoken words — highest priority
const VOICE_SOURCES = ['recording']
// Tier 2: Gelly's written material — notes, scripts, photos
const WRITTEN_SOURCES = ['script', 'notes', 'photo']
// Tier 3: Company manual / training — last resort
const MANUAL_SOURCES = ['training']

export async function POST(req: NextRequest) {
  const { message, history, category } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'No message' }, { status: 400 })

  const supabase = getServiceClient()
  let voiceContext   = ''
  let writtenContext = ''
  let manualContext  = ''

  try {
    const embedding = await embedText(message)

    const [voiceResult, writtenResult, manualResult] = await Promise.allSettled([
      supabase.rpc('match_chunks_by_source', {
        query_embedding: embedding,
        match_count: 5,
        filter_category: category ?? null,
        allowed_sources: VOICE_SOURCES,
      }),
      supabase.rpc('match_chunks_by_source', {
        query_embedding: embedding,
        match_count: 4,
        filter_category: category ?? null,
        allowed_sources: WRITTEN_SOURCES,
      }),
      supabase.rpc('match_chunks_by_source', {
        query_embedding: embedding,
        match_count: 3,
        filter_category: category ?? null,
        allowed_sources: MANUAL_SOURCES,
      }),
    ])

    if (voiceResult.status === 'fulfilled' && voiceResult.value.data?.length > 0) {
      voiceContext = voiceResult.value.data.map((c: any) => c.content).join('\n\n---\n\n')
    }
    if (writtenResult.status === 'fulfilled' && writtenResult.value.data?.length > 0) {
      writtenContext = writtenResult.value.data.map((c: any) => c.content).join('\n\n---\n\n')
    }
    if (manualResult.status === 'fulfilled' && manualResult.value.data?.length > 0) {
      manualContext = manualResult.value.data.map((c: any) => c.content).join('\n\n---\n\n')
    }

    // Fallback: if match_chunks_by_source isn't available, use single search
    if (!voiceContext && !writtenContext && !manualContext) {
      const { data: chunks } = await supabase.rpc('match_chunks', {
        query_embedding: embedding,
        match_count: 10,
        filter_category: category ?? null,
      })
      if (chunks?.length > 0) {
        voiceContext   = chunks.filter((c: any) => VOICE_SOURCES.includes(c.source_type ?? '')).map((c: any) => c.content).join('\n\n---\n\n')
        writtenContext = chunks.filter((c: any) => WRITTEN_SOURCES.includes(c.source_type ?? '')).map((c: any) => c.content).join('\n\n---\n\n')
        manualContext  = chunks.filter((c: any) => MANUAL_SOURCES.includes(c.source_type ?? '')).map((c: any) => c.content).join('\n\n---\n\n')
      }
    }
  } catch {
    // Embeddings failed — answer from persona only
  }

  const systemPrompt = GELLY_SYSTEM_PROMPT
    .replace('{VOICE_CONTEXT}',   voiceContext   || 'No recordings found for this topic yet.')
    .replace('{WRITTEN_CONTEXT}', writtenContext || 'No notes or scripts found for this topic yet.')
    .replace('{MANUAL_CONTEXT}',  manualContext  || 'No manual material found for this topic.')

  try {
    const response = await chat(systemPrompt, history ?? [], message)
    return NextResponse.json({ response })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Chat error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
