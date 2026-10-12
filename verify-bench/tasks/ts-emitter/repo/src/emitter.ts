type Listener = (...args: any[]) => void

export class Emitter {
  private listeners = new Map<string, Listener[]>()

  on(event: string, fn: Listener): () => void {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
    return () => this.off(event, fn)
  }

  off(event: string, fn: Listener): void {
    const list = this.listeners.get(event)
    if (!list) return
    const i = list.indexOf(fn)
    if (i >= 0) list.splice(i, 1)
  }

  // Calls every listener even if some throw; failures are rethrown together afterwards.
  // Returns the number of listeners that were called.
  emit(event: string, ...args: any[]): number {
    const list = this.listeners.get(event) ?? []
    const errors: unknown[] = []
    let called = 0
    for (const fn of list) {
      called++
      try {
        fn(...args)
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
