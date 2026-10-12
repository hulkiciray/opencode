export function parseCSV(text: string): string[][] {
  const lines = text.split("\n")
  if (lines.length && lines[lines.length - 1] === "") lines.pop()
  return lines.map((line) => line.split(","))
}

export function parseCSVWithHeader(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCSV(text)
  if (!header) return []
  return rows.map((row) => Object.fromEntries(header.map((h, i) => [h.trim(), row[i] ?? ""])))
}
