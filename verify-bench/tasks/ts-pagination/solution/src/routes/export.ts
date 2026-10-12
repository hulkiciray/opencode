import { listItems } from "../db"
import type { Response } from "../router"

export function handleExport(query: Record<string, string>): Response {
  const rows = listItems({ category: query.category }).map((i) => `${i.id},${i.name},${i.category},${i.price}`)
  return { status: 200, body: ["id,name,category,price", ...rows].join("\n") }
}
