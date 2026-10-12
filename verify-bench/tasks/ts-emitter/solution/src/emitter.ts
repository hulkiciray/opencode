type Listener = (...args: any[]) => void
type Entry = { fn: Listener; original: Listener; removed: boolean }

export class Emitter {
  private listeners = new Map<string, Entry[]>()

  private add(event: string, entry: Entry) {
    const list = this.listeners.get(event) ?? []
    list.push(entry)
    this.listeners.set(event, list)
    return () => this.remove(event, entry)
  }

  private remove(event: string, entry: Entry) {
    const list = this.listeners.get(event)
    if (!list) return
    const i = list.indexOf(entry)
    if (i >= 0) list.splice(i, 1)
    entry.removed = true
  }

  on(event: string, fn: Listener): () => void {
    return this.add(event, { fn, original: fn, removed: false })
  }

  once(event: string, fn: Listener): () => void {
    const entry: Entry = {
      fn: (...args) => {
        this.remove(event, entry)
        fn(...args)
      },
      original: fn,
      removed: false,
    }
    return this.add(event, entry)
  }

  off(event: string, fn: Listener): void {
    const list = this.listeners.get(event)
    const entry = list?.find((e) => e.original === fn)
    if (entry) this.remove(event, entry)
  }

  // Calls every listener even if some throw; failures are rethrown together afterwards.
  // Returns the number of listeners that were called.
  emit(event: string, ...args: any[]): number {
    const list = [...(this.listeners.get(event) ?? [])]
    const errors: unknown[] = []
    let called = 0
    for (const entry of list) {
      if (entry.removed) continue
      called++
      try {
        entry.fn(...args)
      } catch (e) {
        errors.push(e)
      }
    }
    if (errors.length) throw new AggregateError(errors, `${errors.length} listener(s) failed for "${event}"`)
    return called
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0
  }
}
