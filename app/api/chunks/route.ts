import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

function isAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`
}

// GET — list unapproved chunks for review
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select('id, content, source_type, source_name, category, approved, created_at')
    .eq('approved', false)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — approve or reject a chunk
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, action, category } = await req.json() // action: 'approve' | 'reject'
  const supabase = getServiceClient()

  if (action === 'reject') {
    const { error } = await supabase.from('knowledge_chunks').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  }

  if (action === 'approve') {
    const update: any = { approved: true }
    if (category) update.category = category
    const { error } = await supabase.from('knowledge_chunks').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ approved: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
