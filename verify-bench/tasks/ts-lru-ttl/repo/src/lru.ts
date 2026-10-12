export class LRUCache<K, V> {
  private map = new Map<K, V>()

  constructor(private capacity: number) {
    if (capacity < 1) throw new Error("capacity must be at least 1")
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined
    const value = this.map.get(key) as V
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    else if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value as K
      this.map.delete(oldest)
    }
    this.map.set(key, value)
  }

  // Does not affect recency.
  has(key: K): boolean {
    return this.map.has(key)
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  get size(): number {
    return this.map.size
  }

  // Oldest first.
  keys(): K[] {
    return [...this.map.keys()]
  }
}
