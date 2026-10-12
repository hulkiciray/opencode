import { expect, test } from "bun:test"
import { route } from "../src/router"

test("defaults", () => {
  const res = route("GET", "/items")
  expect(res.status).toBe(200)
  const body = res.body as any
  expect(body.total).toBe(45)
  expect(body.page).toBe(1)
  expect(body.limit).toBe(20)
  expect(body.items.length).toBe(20)
  expect(body.items[0].id).toBe(1)
})

test("last page", () => {
  const body = route("GET", "/items?page=3").body as any
  expect(body.items.map((i: any) => i.id)).toEqual([41, 42, 43, 44, 45])
})

test("page past the end is empty", () => {
  const body = route("GET", "/items?page=9").body as any
  expect(body.items).toEqual([])
  expect(body.total).toBe(45)
})

test("limit is capped", () => {
  const body = route("GET", "/items?limit=500").body as any
  expect(body.limit).toBe(100)
  expect(body.items.length).toBe(45)
})

test("category + pagination", () => {
  const body = route("GET", "/items?category=tools&limit=10&page=2").body as any
  expect(body.total).toBe(15)
  expect(body.items.length).toBe(5)
  expect(body.items.every((i: any) => i.category === "tools")).toBe(true)
})

test("invalid params", () => {
  for (const q of ["page=0", "page=abc", "limit=0", "limit=-5", "limit=x"]) {
    const res = route("GET", `/items?${q}`)
    expect(res.status).toBe(400)
    expect(typeof (res.body as any).error).toBe("string")
  }
})

test("other endpoints unchanged", () => {
  expect((route("GET", "/stats").body as any).count).toBe(45)
  expect((route("GET", "/export.csv").body as string).split("\n").length).toBe(46)
})
