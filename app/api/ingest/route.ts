import { NextRequest, NextResponse } from 'next/server'
import { embedText } from '@/lib/gemini'
import { getServiceClient } from '@/lib/supabase'

function isAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`
}

// Chunk text by paragraphs first, then split oversized paragraphs by sentence
function chunkText(text: string, maxWords = 300): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []

  for (const para of paragraphs) {
    const wordCount = para.split(/\s+/).length
    if (wordCount <= maxWords) {
      chunks.push(para)
    } else {
      // Split oversized paragraph into sentences, then group into chunks
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para]
      let current = ''
      for (const sentence of sentences) {
        const combined = current ? current + ' ' + sentence.trim() : sentence.trim()
        if (combined.split(/\s+/).length > maxWords && current) {
          chunks.push(current.trim())
          current = sentence.trim()
        } else {
          current = combined
        }
      }
      if (current.trim()) chunks.push(current.trim())
    }
  }

  return chunks.filter(c => c.split(/\s+/).length >= 10) // drop tiny fragments
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
