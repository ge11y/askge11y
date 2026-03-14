import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (password === process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: true, role: 'admin' })
  }
  if (password === process.env.TEAM_PASSWORD) {
    return NextResponse.json({ ok: true, role: 'team' })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
