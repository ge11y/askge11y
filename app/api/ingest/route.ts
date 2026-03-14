import { NextRequest, NextResponse } from 'next/server'
import { embedText } from '@/lib/gemini'
import { getServiceClient } from '@/lib/supabase'

function isAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`
}

// Chunk text into segments of ~400 words with 50-word overlap
function chunkText(text: string, chunkSize = 400, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let i = 0
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ')
    if (chunk.trim()) chunks.push(chunk.trim())
    i += chunkSize - overlap
  }
  return chunks
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content, source_type, source_name, category, auto_approve } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'No content' }, { status: 400 })

  const supabase = getServiceClient()
  const chunks = chunkText(content)
  const results = []

  for (const chunk of chunks) {
    let embedding: number[] | null = null
    try {
      embedding = await embedText(chunk)
    } catch {
      // Store without embedding — can re-embed later
    }

    const { data, error } = await supabase
      .from('knowledge_chunks')
      .insert({
        content: chunk,
        embedding,
        source_type: source_type ?? 'notes',
        source_name: source_name ?? null,
        category: category ?? 'general',
        approved: auto_approve ?? false,
      })
      .select('id')
      .single()

    if (!error) results.push(data)
  }

  return NextResponse.json({ inserted: results.length, chunks: results })
}
