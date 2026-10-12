import { expect, test } from "bun:test"
import { Emitter } from "../src/emitter"

test("once runs once", () => {
  const e = new Emitter()
  let n = 0
  e.once("x", () => n++)
  expect(e.emit("x")).toBe(1)
  expect(e.emit("x")).toBe(0)
  expect(n).toBe(1)
  expect(e.listenerCount("x")).toBe(0)
})

test("once returns unsubscribe", () => {
  const e = new Emitter()
  let n = 0
  const off = e.once("x", () => n++)
  off()
  e.emit("x")
  expect(n).toBe(0)
})

test("off with original function removes once listener", () => {
  const e = new Emitter()
  let n = 0
  const fn = () => n++
  e.once("x", fn)
  e.off("x", fn)
  e.emit("x")
  expect(n).toBe(0)
  expect(e.listenerCount("x")).toBe(0)
})

test("once listener that throws is still removed", () => {
  const e = new Emitter()
  e.once("x", () => {
    throw new Error("boom")
  })
  expect(() => e.emit("x")).toThrow(AggregateError)
  expect(e.emit("x")).toBe(0)
})

test("self-unsubscribe does not skip next listener", () => {
  const e = new Emitter()
  const seen: number[] = []
  const off = e.on("x", () => {
    seen.push(1)
    off()
  })
  e.on("x", () => seen.push(2))
  e.on("x", () => seen.push(3))
  expect(e.emit("x")).toBe(3)
  expect(seen).toEqual([1, 2, 3])
})

test("removing a later listener during emit prevents it", () => {
  const e = new Emitter()
  const seen: number[] = []
  const third = () => seen.push(3)
  e.on("x", () => {
    seen.push(1)
    e.off("x", third)
  })
  e.on("x", () => seen.push(2))
  e.on("x", third)
  expect(e.emit("x")).toBe(2)
  expect(seen).toEqual([1, 2])
})

test("listener added during emit runs next time", () => {
  const e = new Emitter()
  const seen: string[] = []
  e.once("x", () => {
    seen.push("a")
    e.on("x", () => seen.push("b"))
  })
  e.emit("x")
  expect(seen).toEqual(["a"])
  e.emit("x")
  expect(seen).toEqual(["a", "b"])
})

test("once inside once", () => {
  const e = new Emitter()
  const seen: number[] = []
  e.once("x", () => seen.push(1))
  e.once("x", () => seen.push(2))
  expect(e.emit("x")).toBe(2)
  expect(seen).toEqual([1, 2])
})
