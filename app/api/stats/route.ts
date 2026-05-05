import { listHistory } from '@/lib/history'

export interface ModelStat {
  model: string
  count: number
  avgDuration: number  // 秒
}

export interface MonthlyStat {
  month: string  // "YYYY-MM"
  count: number
}

export interface StatsResponse {
  totalFiles: number
  totalDuration: number  // 秒
  modelStats: ModelStat[]
  monthlyStats: MonthlyStat[]
}

export async function GET(): Promise<Response> {
  const items = await listHistory()

  // モデル別集計
  const modelMap = new Map<string, { count: number; totalDuration: number }>()
  for (const item of items) {
    const model = item.whisperModel ?? 'unknown'
    const cur = modelMap.get(model) ?? { count: 0, totalDuration: 0 }
    modelMap.set(model, {
      count: cur.count + 1,
      totalDuration: cur.totalDuration + (item.duration ?? 0),
    })
  }
  const modelStats: ModelStat[] = [...modelMap.entries()]
    .map(([model, { count, totalDuration }]) => ({
      model,
      count,
      avgDuration: count > 0 ? Math.round(totalDuration / count) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // 月別集計（直近6ヶ月）
  const monthMap = new Map<string, number>()
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, 0)
  }
  for (const item of items) {
    const key = item.createdAt.slice(0, 7)
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) ?? 0) + 1)
  }
  const monthlyStats: MonthlyStat[] = [...monthMap.entries()].map(([month, count]) => ({ month, count }))

  const totalDuration = items.reduce((acc, i) => acc + (i.duration ?? 0), 0)

  return Response.json({
    totalFiles: items.length,
    totalDuration,
    modelStats,
    monthlyStats,
  } satisfies StatsResponse)
}
