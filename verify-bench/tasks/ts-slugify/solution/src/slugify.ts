export interface SlugOptions {
  maxLength?: number
  separator?: string
}

const SPECIAL: Record<string, string> = { ß: "ss", æ: "ae", ø: "o", œ: "oe", đ: "d", ł: "l", þ: "th" }

export function slugify(input: string, options: SlugOptions = {}): string {
  const maxLength = options.maxLength ?? 50
  const sep = options.separator ?? "-"
  const words = input
    .toLowerCase()
    .replace(/[ßæøœđłþ]/g, (c) => SPECIAL[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s_-]/g, "")
    .split(/[\s_-]+/)
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
