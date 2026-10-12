import { expect, test } from "bun:test"
import { Emitter } from "../src/emitter"

test("calls listeners in order with args", () => {
  const e = new Emitter()
  const seen: string[] = []
  e.on("x", (a) => seen.push("1" + a))
  e.on("x", (a) => seen.push("2" + a))
  expect(e.emit("x", "!")).toBe(2)
  expect(seen).toEqual(["1!", "2!"])
})

test("unsubscribe function", () => {
  const e = new Emitter()
  let n = 0
  const off = e.on("x", () => n++)
  off()
  expect(e.emit("x")).toBe(0)
  expect(n).toBe(0)
})

test("off with function", () => {
  const e = new Emitter()
  const fn = () => {}
  e.on("x", fn)
  e.off("x", fn)
  expect(e.listenerCount("x")).toBe(0)
})

test("same function registered twice runs twice", () => {
  const e = new Emitter()
  let n = 0
  const fn = () => n++
  e.on("x", fn)
  e.on("x", fn)
  e.emit("x")
  expect(n).toBe(2)
})

test("errors are aggregated and other listeners still run", () => {
  const e = new Emitter()
  let ran = false
  e.on("x", () => {
    throw new Error("boom")
  })
  e.on("x", () => {
    ran = true
  })
  expect(() => e.emit("x")).toThrow(AggregateError)
  expect(ran).toBe(true)
})

test("unknown event", () => {
  expect(new Emitter().emit("nope")).toBe(0)
})
