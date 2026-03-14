'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Chat from '@/components/Chat'

export default function Home() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function login(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      const { role } = await res.json()
      setError('')
      if (role === 'admin') {
        sessionStorage.setItem('admin_pw', password)
        router.push('/admin')
      } else {
        setAuthed(true)
      }
    } else {
      setError('Wrong password.')
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
              G
            </div>
            <h1 className="text-2xl font-bold text-white">Ask Gelly</h1>
            <p className="text-zinc-400 text-sm mt-1">Your personal pest control sales coach</p>
          </div>
          <form onSubmit={login} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Team password"
              className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-zinc-700 focus:border-orange-500 transition-colors placeholder:text-zinc-500"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-400 text-white py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
        <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold">
          G
        </div>
        <div>
          <div className="text-white font-semibold text-sm">Ask Gelly</div>
          <div className="text-zinc-500 text-xs">Pest Control Sales Coach</div>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Chat />
      </div>
    </div>
  )
}
