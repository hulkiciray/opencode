export interface Item {
  id: number
  name: string
  category: "tools" | "garden" | "kitchen"
  price: number
}

const categories = ["tools", "garden", "kitchen"] as const

export const items: Item[] = Array.from({ length: 45 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  category: categories[i % 3],
  price: 5 + ((i * 7) % 40),
}))

export function listItems(filter: { category?: string } = {}): Item[] {
  return items.filter((item) => !filter.category || item.category === filter.category)
}

export function getItem(id: number): Item | undefined {
  return items.find((item) => item.id === id)
}
