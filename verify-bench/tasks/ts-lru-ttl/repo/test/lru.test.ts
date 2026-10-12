import { expect, test } from "bun:test"
import { LRUCache } from "../src/lru"

test("evicts least recently used", () => {
  const c = new LRUCache<string, number>(2)
  c.set("a", 1)
  c.set("b", 2)
  c.set("c", 3)
  expect(c.has("a")).toBe(false)
  expect(c.keys()).toEqual(["b", "c"])
})

test("get refreshes recency", () => {
  const c = new LRUCache<string, number>(2)
  c.set("a", 1)
  c.set("b", 2)
  expect(c.get("a")).toBe(1)
  c.set("c", 3)
  expect(c.keys()).toEqual(["a", "c"])
})

test("has does not refresh recency", () => {
  const c = new LRUCache<string, number>(2)
  c.set("a", 1)
  c.set("b", 2)
  expect(c.has("a")).toBe(true)
  c.set("c", 3)
  expect(c.keys()).toEqual(["b", "c"])
})

test("set on existing key updates and refreshes", () => {
  const c = new LRUCache<string, number>(2)
  c.set("a", 1)
  c.set("b", 2)
  c.set("a", 10)
  c.set("c", 3)
  expect(c.get("a")).toBe(10)
  expect(c.has("b")).toBe(false)
  expect(c.size).toBe(2)
})

test("undefined values are stored", () => {
  const c = new LRUCache<string, number | undefined>(2)
  c.set("a", undefined)
  expect(c.has("a")).toBe(true)
  expect(c.size).toBe(1)
})

test("delete", () => {
  const c = new LRUCache<string, number>(2)
  c.set("a", 1)
  expect(c.delete("a")).toBe(true)
  expect(c.delete("a")).toBe(false)
  expect(c.size).toBe(0)
})

test("rejects bad capacity", () => {
  expect(() => new LRUCache(0)).toThrow()
})
