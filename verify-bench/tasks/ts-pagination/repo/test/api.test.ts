import { expect, test } from "bun:test"
import { route } from "../src/router"

test("stats covers every item", () => {
  const res = route("GET", "/stats")
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ count: 45, byCategory: { tools: 15, garden: 15, kitchen: 15 }, averagePrice: 23.89 })
})

test("export includes all items in a category", () => {
  const res = route("GET", "/export.csv?category=garden")
  const lines = (res.body as string).split("\n")
  expect(lines[0]).toBe("id,name,category,price")
  expect(lines.length).toBe(16)
})

test("export without filter includes everything", () => {
  const res = route("GET", "/export.csv")
  expect((res.body as string).split("\n").length).toBe(46)
})

test("get item", () => {
  expect(route("GET", "/items/3").body).toMatchObject({ id: 3, category: "kitchen" })
  expect(route("GET", "/items/999").status).toBe(404)
})

test("method not allowed", () => {
  expect(route("POST", "/items").status).toBe(405)
})
