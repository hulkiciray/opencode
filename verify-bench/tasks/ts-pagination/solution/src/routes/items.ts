import { getItem, listItems } from "../db"
import type { Response } from "../router"

function positive(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback
  return /^\d+$/.test(value) && Number(value) >= 1 ? Number(value) : undefined
}

export function handleListItems(query: Record<string, string>): Response {
  const page = positive(query.page, 1)
  const limit = positive(query.limit, 20)
  if (page === undefined || limit === undefined) return { status: 400, body: { error: "page and limit must be positive integers" } }
  const capped = Math.min(limit, 100)
  const all = listItems({ category: query.category })
  return { status: 200, body: { items: all.slice((page - 1) * capped, page * capped), total: all.length, page, limit: capped } }
}

export function handleGetItem(id: string): Response {
  const item = getItem(Number(id))
  if (!item) return { status: 404, body: { error: "not found" } }
  return { status: 200, body: item }
}
