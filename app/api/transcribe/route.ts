import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

function isAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    language: 'en',
    response_format: 'text',
  })

  const text = typeof transcription === 'string' ? transcription : (transcription as any).text
  return NextResponse.json({ transcript: text, filename: file.name })
}
