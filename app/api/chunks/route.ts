import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

function isAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`
}

// GET — list chunks. ?all=true returns all, default returns unapproved only
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getServiceClient()
  const all = new URL(req.url).searchParams.get('all') === 'true'
  const query = supabase
    .from('knowledge_chunks')
    .select('id, content, source_type, source_name, category, approved, embedding, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (!all) query.eq('approved', false)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Return summary stats + rows (strip embedding from rows to keep response small)
  const rows = (data ?? []).map(({ embedding, ...rest }: any) => ({
    ...rest,
    has_embedding: embedding !== null,
  }))
  return NextResponse.json({
    total: rows.length,
    approved: rows.filter((r: any) => r.approved).length,
    unapproved: rows.filter((r: any) => !r.approved).length,
    missing_embedding: rows.filter((r: any) => !r.has_embedding).length,
    rows,
  })
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
