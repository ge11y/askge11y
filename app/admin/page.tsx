'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const CATEGORIES = ['opener', 'pitch', 'objection', 'close', 'tonality', 'cancel', 'general']
const SOURCE_TYPES = ['recording', 'script', 'notes', 'photo', 'training']

interface Chunk {
  id: string
  content: string
  source_type: string
  source_name: string | null
  category: string
  approved: boolean
  created_at: string
}

export default function AdminPage() {
  const [authed, setAuthed]       = useState(false)
  const [password, setPassword]   = useState('')
  const [authError, setAuthError] = useState('')
  const [tab, setTab]             = useState<'add' | 'upload' | 'review'>('add')

  // Add content state
  const [content, setContent]       = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceType, setSourceType] = useState('notes')
  const [category, setCategory]     = useState('general')
  const [autoApprove, setAutoApprove] = useState(true)
  const [addStatus, setAddStatus]   = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Upload + transcribe state
  const [uploadFile, setUploadFile]         = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState('general')
  const [transcript, setTranscript]         = useState('')
  const [uploadStatus, setUploadStatus]     = useState('')
  const [transcribing, setTranscribing]     = useState(false)
  const [uploading, setUploading]           = useState(false)
  const [uploadApprove, setUploadApprove]   = useState(false)
  const [analysis, setAnalysis]             = useState<any>(null)
  const [analyzing, setAnalyzing]           = useState(false)
  const [uploadMode, setUploadMode]         = useState<'salesperson' | 'full'>('salesperson')

  async function transcribeFile() {
    if (!uploadFile) return
    setTranscribing(true)
    setTranscript('')
    setUploadStatus('')
    try {
      const form = new FormData()
      form.append('file', uploadFile)
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${password}` },
        body: form,
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTranscript(data.transcript ?? '')
      setUploadStatus('Transcription complete — review below then ingest.')
    } catch (err: any) {
      setUploadStatus(`Error: ${err.message}`)
    } finally {
      setTranscribing(false)
    }
  }

  async function analyzeTranscript() {
    if (!transcript.trim()) return
    setAnalyzing(true)
    setAnalysis(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`,
        },
        body: JSON.stringify({ transcript }),
      })
      const data = await res.json()
      setAnalysis(data)
      setUploadStatus('Analysis complete — review what was extracted below.')
    } catch {
      setUploadStatus('Analysis failed — try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function ingestTranscript() {
    // Decide what content to ingest
    const contentToIngest = (analysis && uploadMode === 'salesperson' && analysis.salesperson_lines)
      ? analysis.salesperson_lines
      : transcript
    if (!contentToIngest.trim()) return

    setUploading(true)
    const entries = []

    // Main content (salesperson lines or full transcript)
    entries.push(fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${password}` },
      body: JSON.stringify({
        content: contentToIngest,
        source_type: 'recording',
        source_name: uploadFile?.name ?? 'upload',
        category: uploadCategory,
        auto_approve: uploadApprove,
      }),
    }))

    // If we have analysis, also ingest the key moments + buzzwords as a separate chunk
    if (analysis && analysis.key_moments?.length > 0) {
      const phraseContent = [
        analysis.approach_summary ? `GELLY'S APPROACH:\n${analysis.approach_summary}` : '',
        analysis.buzzwords?.length ? `KEY PHRASES & BUZZWORDS:\n${analysis.buzzwords.join(', ')}` : '',
        analysis.patterns?.length ? `PATTERNS:\n${analysis.patterns.join('\n')}` : '',
        analysis.key_moments?.length ? `KEY MOMENTS (exact quotes):\n${analysis.key_moments.join('\n')}` : '',
      ].filter(Boolean).join('\n\n')

      entries.push(fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${password}` },
        body: JSON.stringify({
          content: phraseContent,
          source_type: 'notes',
          source_name: `analysis-of-${uploadFile?.name ?? 'upload'}`,
          category: 'general',
          auto_approve: uploadApprove,
        }),
      }))
    }

    try {
      const results = await Promise.all(entries)
      const jsons = await Promise.all(results.map(r => r.json()))
      const total = jsons.reduce((sum, d) => sum + (d.inserted ?? 0), 0)
      setUploadStatus(`✓ ${total} chunk${total !== 1 ? 's' : ''} added${uploadApprove ? ' and live' : ' — go to Review to approve'}`)
      setTranscript('')
      setUploadFile(null)
      setAnalysis(null)
    } catch {
      setUploadStatus('Ingest failed — try again.')
    } finally {
      setUploading(false)
    }
  }

  // Review queue state
  const [chunks, setChunks]           = useState<Chunk[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Auto-auth if coming from main login page
  const autoAuthed = useRef(false)
  useEffect(() => {
    if (autoAuthed.current) return
    autoAuthed.current = true
    const stored = sessionStorage.getItem('admin_pw')
    if (stored) {
      setPassword(stored)
      setAuthed(true)
    }
  }, [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      const { role } = await res.json()
      if (role === 'admin') { setAuthed(true); setAuthError('') }
      else setAuthError('Wrong password.')
    } else {
      setAuthError('Wrong password.')
    }
  }

  const loadReviewQueue = useCallback(async () => {
    setReviewLoading(true)
    try {
      const res = await fetch('/api/chunks', {
        headers: { 'Authorization': `Bearer ${password}` },
      })
      const data = await res.json()
      setChunks(Array.isArray(data) ? data : [])
    } catch { setChunks([]) }
    finally { setReviewLoading(false) }
  }, [password])

  useEffect(() => {
    if (authed && tab === 'review') loadReviewQueue()
  }, [authed, tab, loadReviewQueue])

  async function submitContent(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setAddLoading(true)
    setAddStatus('')
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`,
        },
        body: JSON.stringify({ content, source_type: sourceType, source_name: sourceName, category, auto_approve: autoApprove }),
      })
      const data = await res.json()
      setAddStatus(`✓ ${data.inserted} chunk${data.inserted !== 1 ? 's' : ''} added${autoApprove ? ' and live' : ' — go to Review to approve'}`)
      setContent('')
      setSourceName('')
    } catch { setAddStatus('Error — try again.') }
    finally { setAddLoading(false) }
  }

  async function handleChunkAction(id: string, action: 'approve' | 'reject', category?: string) {
    setActionLoading(id + action)
    try {
      await fetch('/api/chunks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`,
        },
        body: JSON.stringify({ id, action, category }),
      })
      setChunks(prev => prev.filter(c => c.id !== id))
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <h1 className="text-white font-bold text-xl mb-6 text-center">Admin — Ask Gelly</h1>
          <form onSubmit={login} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-zinc-700 focus:border-orange-500 transition-colors placeholder:text-zinc-500"
            />
            {authError && <p className="text-red-400 text-xs">{authError}</p>}
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-400 text-white py-3 rounded-xl text-sm font-medium transition-colors">
              Enter
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold">G</div>
          <div>
            <div className="text-white font-semibold">Ask Gelly — Admin</div>
            <div className="text-zinc-500 text-xs">Manage the knowledge base</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-xl">
          {(['add', 'upload', 'review'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-orange-500 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t === 'add' ? 'Paste Text' : t === 'upload' ? 'Upload Audio' : `Review${chunks.length > 0 && tab !== 'review' ? ` (${chunks.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* Add Content Tab */}
        {tab === 'add' && (
          <form onSubmit={submitContent} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Source Type</label>
                <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
                  className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm border border-zinc-700 outline-none">
                  {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm border border-zinc-700 outline-none">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Source Name (optional)</label>
              <input value={sourceName} onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. objection-handling-notes.txt"
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm border border-zinc-700 outline-none focus:border-orange-500 transition-colors placeholder:text-zinc-600" />
            </div>

            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Content</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)}
                placeholder="Paste scripts, notes, transcripts..."
                rows={14}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm border border-zinc-700 outline-none focus:border-orange-500 transition-colors placeholder:text-zinc-600 resize-none font-mono" />
              <div className="text-zinc-600 text-xs mt-1">{content.split(/\s+/).filter(Boolean).length} words</div>
            </div>

            <div className="flex items-center gap-2">
              <input id="approve" type="checkbox" checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)} className="accent-orange-500" />
              <label htmlFor="approve" className="text-zinc-400 text-sm">
                Auto-approve — make searchable immediately
                {!autoApprove && <span className="text-zinc-600"> (will go to Review queue)</span>}
              </label>
            </div>

            <button type="submit" disabled={!content.trim() || addLoading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-medium transition-colors">
              {addLoading ? 'Adding...' : 'Add to Knowledge Base'}
            </button>

            {addStatus && (
              <div className={`text-sm text-center py-2 rounded-lg ${addStatus.startsWith('✓') ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {addStatus}
              </div>
            )}

            <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-xs font-medium mb-2">WHAT TO ADD FIRST</div>
              <ul className="text-zinc-500 text-xs space-y-1.5">
                <li className="flex gap-2"><span className="text-orange-500">1.</span>Your written scripts and objection handlers — pure Gelly, auto-approve these</li>
                <li className="flex gap-2"><span className="text-orange-500">2.</span>Your known sales recordings — transcribe and auto-approve</li>
                <li className="flex gap-2"><span className="text-orange-500">3.</span>Mixed recordings — leave auto-approve OFF, review each chunk before it goes live</li>
              </ul>
            </div>
          </form>
        )}

        {/* Upload Audio Tab */}
        {tab === 'upload' && (
          <div className="space-y-4">
            <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-500 text-xs leading-relaxed">
              Plug in your iPhone → open Finder → click your iPhone → Files → Voice Memos → drag a file here, or click to browse. Accepts .m4a, .mp3, .wav, .mp4.
            </div>

            {/* File picker */}
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Audio File</label>
              <label className={`flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                uploadFile ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
              }`}>
                <input
                  type="file"
                  accept=".m4a,.mp3,.wav,.mp4,.ogg,.webm,.flac"
                  className="hidden"
                  onChange={(e) => {
                    setUploadFile(e.target.files?.[0] ?? null)
                    setTranscript('')
                    setUploadStatus('')
                  }}
                />
                {uploadFile ? (
                  <div className="text-center">
                    <div className="text-white text-sm font-medium">{uploadFile.name}</div>
                    <div className="text-zinc-500 text-xs mt-1">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB — click to change</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-zinc-400 text-sm">Click to choose a file</div>
                    <div className="text-zinc-600 text-xs mt-1">.m4a · .mp3 · .wav · .mp4</div>
                  </div>
                )}
              </label>
            </div>

            {/* Category */}
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Category</label>
              <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm border border-zinc-700 outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>

            {/* Transcribe button */}
            <button
              onClick={transcribeFile}
              disabled={!uploadFile || transcribing}
              className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-medium transition-colors"
            >
              {transcribing ? 'Transcribing — this may take a minute...' : 'Transcribe'}
            </button>

            {/* Transcript + Analysis */}
            {transcript && (
              <>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block">Raw Transcript</label>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={8}
                    className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm border border-zinc-700 outline-none focus:border-orange-500 transition-colors resize-none font-mono"
                  />
                  <div className="text-zinc-600 text-xs mt-1">{transcript.split(/\s+/).filter(Boolean).length} words — includes both you and the customer</div>
                </div>

                {/* Analyze button */}
                {!analysis && (
                  <button
                    onClick={analyzeTranscript}
                    disabled={analyzing}
                    className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-medium transition-colors"
                  >
                    {analyzing ? 'Analyzing — extracting your lines and phrases...' : 'Analyze Pitch → Extract My Voice'}
                  </button>
                )}

                {/* Analysis results */}
                {analysis && !analysis.parse_error && (
                  <div className="space-y-3">
                    {/* Approach summary */}
                    {analysis.approach_summary && (
                      <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                        <div className="text-zinc-400 text-xs font-medium mb-1">YOUR APPROACH IN THIS PITCH</div>
                        <p className="text-zinc-300 text-sm leading-relaxed">{analysis.approach_summary}</p>
                      </div>
                    )}

                    {/* Buzzwords */}
                    {analysis.buzzwords?.length > 0 && (
                      <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                        <div className="text-zinc-400 text-xs font-medium mb-2">PHRASES & BUZZWORDS EXTRACTED</div>
                        <div className="flex flex-wrap gap-2">
                          {analysis.buzzwords.map((w: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-orange-500/15 text-orange-400 rounded text-xs">{w}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Patterns */}
                    {analysis.patterns?.length > 0 && (
                      <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                        <div className="text-zinc-400 text-xs font-medium mb-2">YOUR PATTERNS</div>
                        <ul className="space-y-1">
                          {analysis.patterns.map((p: string, i: number) => (
                            <li key={i} className="text-zinc-400 text-xs flex gap-2">
                              <span className="text-orange-500 shrink-0">—</span>{p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Key moments */}
                    {analysis.key_moments?.length > 0 && (
                      <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                        <div className="text-zinc-400 text-xs font-medium mb-2">KEY MOMENTS — EXACT QUOTES</div>
                        <ul className="space-y-1.5">
                          {analysis.key_moments.map((m: string, i: number) => (
                            <li key={i} className="text-zinc-300 text-xs italic leading-relaxed">"{m}"</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Salesperson lines */}
                    {analysis.salesperson_lines && (
                      <div>
                        <label className="text-zinc-400 text-xs mb-1 block">YOUR LINES ONLY — what gets stored in the knowledge base</label>
                        <textarea
                          value={analysis.salesperson_lines}
                          onChange={(e) => setAnalysis({ ...analysis, salesperson_lines: e.target.value })}
                          rows={8}
                          className="w-full bg-zinc-800 text-zinc-200 rounded-lg px-3 py-2 text-sm border border-orange-500/30 outline-none focus:border-orange-500 transition-colors resize-none font-mono"
                        />
                      </div>
                    )}

                    {/* What to store */}
                    <div className="flex gap-1 bg-zinc-900 p-1 rounded-xl">
                      {(['salesperson', 'full'] as const).map((m) => (
                        <button key={m} onClick={() => setUploadMode(m)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${uploadMode === m ? 'bg-orange-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                          {m === 'salesperson' ? 'Store my lines only (recommended)' : 'Store full transcript'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input id="upload-approve" type="checkbox" checked={uploadApprove}
                    onChange={(e) => setUploadApprove(e.target.checked)} className="accent-orange-500" />
                  <label htmlFor="upload-approve" className="text-zinc-400 text-sm">
                    This sounds like me — approve immediately
                    {!uploadApprove && <span className="text-zinc-600"> (goes to Review queue)</span>}
                  </label>
                </div>

                <button
                  onClick={ingestTranscript}
                  disabled={uploading}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-medium transition-colors"
                >
                  {uploading ? 'Adding to knowledge base...' : 'Add to Knowledge Base'}
                </button>
              </>
            )}

            {uploadStatus && (
              <div className={`text-sm text-center py-2 rounded-lg ${uploadStatus.startsWith('✓') ? 'text-green-400 bg-green-400/10' : uploadStatus.startsWith('Transcription') ? 'text-blue-400 bg-blue-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {uploadStatus}
              </div>
            )}
          </div>
        )}

        {/* Review Queue Tab */}
        {tab === 'review' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-zinc-400 text-sm">{chunks.length} chunk{chunks.length !== 1 ? 's' : ''} waiting for review</div>
              <button onClick={loadReviewQueue} className="text-zinc-500 hover:text-white text-xs transition-colors">
                Refresh
              </button>
            </div>

            {reviewLoading && (
              <div className="text-zinc-500 text-sm text-center py-12">Loading...</div>
            )}

            {!reviewLoading && chunks.length === 0 && (
              <div className="text-center py-12">
                <div className="text-zinc-600 text-sm">No chunks waiting for review.</div>
                <div className="text-zinc-700 text-xs mt-1">Add content with auto-approve OFF to queue it here.</div>
              </div>
            )}

            <div className="space-y-4">
              {chunks.map((chunk) => (
                <div key={chunk.id} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                  {/* Chunk meta */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{chunk.source_type}</span>
                    {chunk.source_name && <span className="text-xs text-zinc-600 truncate">{chunk.source_name}</span>}
                    <div className="ml-auto">
                      <select
                        defaultValue={chunk.category}
                        onChange={(e) => { chunk.category = e.target.value }}
                        className="bg-zinc-800 text-zinc-400 text-xs rounded px-2 py-1 border border-zinc-700 outline-none"
                      >
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Chunk content */}
                  <div className="px-4 py-3">
                    <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{chunk.content}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 px-4 py-3 border-t border-zinc-800">
                    <button
                      onClick={() => handleChunkAction(chunk.id, 'approve', chunk.category)}
                      disabled={actionLoading === chunk.id + 'approve'}
                      className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      ✓ This sounds like me — approve
                    </button>
                    <button
                      onClick={() => handleChunkAction(chunk.id, 'reject')}
                      disabled={actionLoading === chunk.id + 'reject'}
                      className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      ✗ Not me — delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
