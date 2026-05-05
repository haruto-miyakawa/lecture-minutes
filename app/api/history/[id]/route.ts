import { getHistory, deleteHistory } from '@/lib/history'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const entry = await getHistory(id)
  if (!entry) return Response.json({ error: '見つかりません' }, { status: 404 })
  return Response.json(entry)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  try {
    await deleteHistory(id)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/history]', err)
    return Response.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
