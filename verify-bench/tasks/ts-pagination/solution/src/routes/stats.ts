import { listItems } from "../db"
import type { Response } from "../router"

export function handleStats(): Response {
  const all = listItems()
  const byCategory: Record<string, number> = {}
  for (const item of all) byCategory[item.category] = (byCategory[item.category] ?? 0) + 1
  const total = all.reduce((sum, item) => sum + item.price, 0)
  return { status: 200, body: { count: all.length, byCategory, averagePrice: Math.round((total / all.length) * 100) / 100 } }
}
