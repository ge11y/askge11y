import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/groq'

function isAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`
}

const ANALYSIS_PROMPT = `You are analyzing a door-to-door pest control sales pitch transcript. The salesperson is named Gelly. Your job is to extract Gelly's voice and patterns from this recording.

Return a JSON object with exactly these fields:
{
  "salesperson_lines": "A clean script of ONLY what the salesperson said, in order. Remove all customer lines. Keep exact wording — do not paraphrase.",
  "buzzwords": ["array", "of", "specific", "words", "or", "short", "phrases", "Gelly", "repeats", "or", "that", "are", "signature", "to", "his", "style"],
  "patterns": ["array of sentence structures or techniques he uses — e.g. 'asks a question before making his point', 'uses we/us language to build rapport', 'mirrors customer objections back before responding'"],
  "approach_summary": "2-3 sentences describing how Gelly sells — his energy, his flow, what makes his style distinct",
  "key_moments": ["array of specific things he says that are especially effective or repeatable — exact quotes if possible"]
}

Only return the JSON object. No other text.`

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { transcript } = await req.json()
  if (!transcript?.trim()) return NextResponse.json({ error: 'No transcript' }, { status: 400 })

  const raw = await chat(
    ANALYSIS_PROMPT,
    [],
    `Here is the transcript to analyze:\n\n${transcript}`
  )

  // Parse JSON out of the response
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const analysis = JSON.parse(jsonMatch[0])
    return NextResponse.json(analysis)
  } catch {
    // Return raw if JSON parse fails
    return NextResponse.json({ raw, parse_error: true })
  }
}
