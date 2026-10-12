import { expect, test } from "bun:test"
import { LRUCache } from "../src/lru"

function clock() {
  let t = 0
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

test("default ttl expires entries", () => {
  const k = clock()
  const c = new LRUCache<string, number>(3, { ttl: 100, now: k.now })
  c.set("a", 1)
  k.advance(99)
  expect(c.get("a")).toBe(1)
  k.advance(1)
  expect(c.get("a")).toBeUndefined()
  expect(c.has("a")).toBe(false)
})

test("per-entry ttl overrides default, no ttl never expires", () => {
  const k = clock()
  const c = new LRUCache<string, number>(3, { now: k.now })
  c.set("a", 1, 50)
  c.set("b", 2)
  k.advance(1_000_000)
  expect(c.has("a")).toBe(false)
  expect(c.get("b")).toBe(2)
})

test("expired entries not counted in size or keys", () => {
  const k = clock()
  const c = new LRUCache<string, number>(3, { ttl: 10, now: k.now })
  c.set("a", 1)
  c.set("b", 2, 1000)
  k.advance(20)
  expect(c.size).toBe(1)
  expect(c.keys()).toEqual(["b"])
})

test("full cache drops expired before evicting live", () => {
  const k = clock()
  const c = new LRUCache<string, number>(2, { now: k.now })
  c.set("old", 1)
  c.set("short", 2, 10)
  k.advance(20)
  c.set("new", 3)
  expect(c.has("old")).toBe(true)
  expect(c.keys()).toEqual(["old", "new"])
})

test("setting again resets ttl", () => {
  const k = clock()
  const c = new LRUCache<string, number>(2, { ttl: 100, now: k.now })
  c.set("a", 1)
  k.advance(80)
  c.set("a", 2)
  k.advance(80)
  expect(c.get("a")).toBe(2)
})

test("old constructor still works", () => {
  const c = new LRUCache<string, number>(1)
  c.set("a", 1)
  expect(c.get("a")).toBe(1)
})
