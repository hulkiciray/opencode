import { getItem, listItems } from "../db"
import type { Response } from "../router"

export function handleListItems(query: Record<string, string>): Response {
  return { status: 200, body: listItems({ category: query.category }) }
}

export function handleGetItem(id: string): Response {
  const item = getItem(Number(id))
  if (!item) return { status: 404, body: { error: "not found" } }
  return { status: 200, body: item }
}
