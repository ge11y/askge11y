import { NextRequest, NextResponse } from 'next/server'
import { embedText } from '@/lib/gemini'
import { getServiceClient } from '@/lib/supabase'

const VOICE_SOURCES = ['recording']
const WRITTEN_SOURCES = ['script', 'notes', 'photo']
const MANUAL_SOURCES = ['training']

function isAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, category } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'No message' }, { status: 400 })

  const supabase = getServiceClient()
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

  return NextResponse.json({
    query: message,
    voice: voiceResult.status === 'fulfilled'
      ? voiceResult.value.data?.map((c: any) => ({ similarity: c.similarity, preview: c.content.slice(0, 120) }))
      : { error: (voiceResult as any).reason?.message },
    written: writtenResult.status === 'fulfilled'
      ? writtenResult.value.data?.map((c: any) => ({ similarity: c.similarity, preview: c.content.slice(0, 120) }))
      : { error: (writtenResult as any).reason?.message },
    manual: manualResult.status === 'fulfilled'
      ? manualResult.value.data?.map((c: any) => ({ similarity: c.similarity, preview: c.content.slice(0, 120) }))
      : { error: (manualResult as any).reason?.message },
  })
}
