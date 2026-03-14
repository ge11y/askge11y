/**
 * Batch transcription + ingestion script
 *
 * Usage:
 *   node scripts/ingest-recordings.mjs /path/to/folder/of/recordings
 *
 * What it does:
 *   1. Finds all audio files in the folder (.m4a, .mp3, .wav, .mp4, .ogg)
 *   2. Transcribes each one using Groq Whisper (free)
 *   3. Ingests the transcript straight into the Ask Gelly knowledge base
 *
 * Requirements:
 *   - npm run dev must be running (or set BASE_URL to your deployed URL)
 *   - GROQ_API_KEY and ADMIN_PASSWORD must be in .env.local
 */

import fs from 'fs'
import path from 'path'
import { readFileSync } from 'fs'
import Groq from 'groq-sdk'

// ─── Config ──────────────────────────────────────────────────────────────────

// Load .env.local manually
const envPath = new URL('../.env.local', import.meta.url).pathname
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const GROQ_API_KEY  = env.GROQ_API_KEY
const ADMIN_PASSWORD = env.ADMIN_PASSWORD
const BASE_URL      = process.env.BASE_URL ?? 'http://localhost:3001'

const AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.mp4', '.ogg', '.webm', '.flac']

// Default category — change this per run if needed
// Options: opener | pitch | objection | close | tonality | cancel | general
const DEFAULT_CATEGORY = 'general'

// Set to true only for recordings you KNOW are yours (confirmed sales, clean recordings)
// For mixed/unlabeled recordings, leave as false — chunks go to Review queue for you to approve
const AUTO_APPROVE = false

// ─── Helpers ─────────────────────────────────────────────────────────────────

const groq = new Groq({ apiKey: GROQ_API_KEY })

async function transcribeFile(filePath) {
  const fileStream = fs.createReadStream(filePath)
  const transcription = await groq.audio.transcriptions.create({
    file: fileStream,
    model: 'whisper-large-v3-turbo',
    language: 'en',
    response_format: 'text',
  })
  return typeof transcription === 'string' ? transcription : transcription.text
}

async function ingestTranscript(text, sourceName, category) {
  const res = await fetch(`${BASE_URL}/api/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_PASSWORD}`,
    },
    body: JSON.stringify({
      content: text,
      source_type: 'recording',
      source_name: sourceName,
      category,
      auto_approve: AUTO_APPROVE,
    }),
  })
  if (!res.ok) throw new Error(`Ingest failed: ${res.status} ${await res.text()}`)
  return await res.json()
}

function findAudioFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findAudioFiles(fullPath))
    } else if (AUDIO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath)
    }
  }
  return files
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const folderArg = process.argv[2]
if (!folderArg) {
  console.error('Usage: node scripts/ingest-recordings.mjs /path/to/recordings/folder')
  process.exit(1)
}

const folder = path.resolve(folderArg)
if (!fs.existsSync(folder)) {
  console.error(`Folder not found: ${folder}`)
  process.exit(1)
}

const files = findAudioFiles(folder)
if (files.length === 0) {
  console.error(`No audio files found in ${folder}`)
  process.exit(1)
}

console.log(`\nFound ${files.length} audio file(s) in ${folder}\n`)

let success = 0
let failed  = 0

for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const name = path.basename(file)
  process.stdout.write(`[${i + 1}/${files.length}] ${name} ... `)

  try {
    // Transcribe
    const transcript = await transcribeFile(file)
    if (!transcript?.trim()) {
      console.log('skipped (empty transcript)')
      continue
    }

    // Ingest
    const result = await ingestTranscript(transcript, name, DEFAULT_CATEGORY)
    console.log(`✓  ${result.inserted} chunk(s) ingested`)
    success++

    // Groq free tier: small pause to avoid rate limiting
    if (i < files.length - 1) await sleep(500)

  } catch (err) {
    console.log(`✗  ERROR: ${err.message}`)
    failed++
    // Pause longer on error
    await sleep(2000)
  }
}

console.log(`\nDone. ${success} file(s) ingested, ${failed} failed.`)
console.log(`Check http://localhost:3001 — rookies can start asking questions now.\n`)
