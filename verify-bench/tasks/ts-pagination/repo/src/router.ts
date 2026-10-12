import { handleExport } from "./routes/export"
import { handleGetItem, handleListItems } from "./routes/items"
import { handleStats } from "./routes/stats"

export interface Response {
  status: number
  body: unknown
}

export function route(method: string, url: string): Response {
  const parsed = new URL(url, "http://localhost")
  const query = Object.fromEntries(parsed.searchParams)
  const path = parsed.pathname
  if (method !== "GET") return { status: 405, body: { error: "method not allowed" } }
  if (path === "/items") return handleListItems(query)
  if (path === "/stats") return handleStats()
  if (path === "/export.csv") return handleExport(query)
  const match = path.match(/^\/items\/(\d+)$/)
  if (match) return handleGetItem(match[1])
  return { status: 404, body: { error: "not found" } }
}
