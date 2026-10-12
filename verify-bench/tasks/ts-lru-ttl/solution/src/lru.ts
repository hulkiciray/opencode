export interface LRUOptions {
  ttl?: number
  now?: () => number
}

export class LRUCache<K, V> {
  private map = new Map<K, { value: V; expires: number }>()
  private ttl: number | undefined
  private now: () => number

  constructor(private capacity: number, options: LRUOptions = {}) {
    if (capacity < 1) throw new Error("capacity must be at least 1")
    this.ttl = options.ttl
    this.now = options.now ?? Date.now
  }

  private live(key: K) {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (entry.expires <= this.now()) {
      this.map.delete(key)
      return undefined
    }
    return entry
  }

  private purge() {
    for (const key of [...this.map.keys()]) this.live(key)
  }

  get(key: K): V | undefined {
    const entry = this.live(key)
    if (!entry) return undefined
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.ttl
    const expires = ttl === undefined ? Infinity : this.now() + ttl
    if (this.map.has(key)) this.map.delete(key)
    else {
      this.purge()
      if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value as K)
    }
    this.map.set(key, { value, expires })
  }

  // Does not affect recency.
  has(key: K): boolean {
    return this.live(key) !== undefined
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  get size(): number {
    this.purge()
    return this.map.size
  }

  // Oldest first.
  keys(): K[] {
    this.purge()
    return [...this.map.keys()]
  }
}
