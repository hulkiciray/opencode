export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let i = 0
  if (text === "") return []
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (ch === '"') {
        quoted = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"' && field === "") {
      quoted = true
      i++
      continue
    }
    if (ch === ",") {
      row.push(field)
      field = ""
      i++
      continue
    }
    if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i += ch === "\r" ? 2 : 1
      continue
    }
    field += ch
    i++
  }
  const last = text.endsWith("\n")
  if (!last) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function parseCSVWithHeader(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCSV(text)
  if (!header) return []
  return rows.map((row) => Object.fromEntries(header.map((h, i) => [h.trim(), row[i] ?? ""])))
}
