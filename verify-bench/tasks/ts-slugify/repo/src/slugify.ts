export interface SlugOptions {
  maxLength?: number
  separator?: string
}

export function slugify(input: string, options: SlugOptions = {}): string {
  const maxLength = options.maxLength ?? 50
  const sep = options.separator ?? "-"
  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean)
  let out = ""
  for (const word of words) {
    const next = out ? out + sep + word : word
    if (next.length > maxLength) {
      if (!out) out = word.slice(0, maxLength)
      break
    }
    out = next
  }
  return out
}
