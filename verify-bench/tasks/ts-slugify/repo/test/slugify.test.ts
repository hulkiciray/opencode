import { expect, test } from "bun:test"
import { slugify } from "../src/slugify"

test("basic", () => {
  expect(slugify("Hello World")).toBe("hello-world")
})

test("collapses whitespace and dashes", () => {
  expect(slugify("  Multiple   spaces -- and dashes ")).toBe("multiple-spaces-and-dashes")
})

test("drops punctuation", () => {
  expect(slugify("What's up, doc?")).toBe("whats-up-doc")
})

test("keeps digits", () => {
  expect(slugify("Version 2.0 release")).toBe("version-20-release")
})

test("truncates at word boundary", () => {
  expect(slugify("the quick brown fox jumps", { maxLength: 15 })).toBe("the-quick-brown")
})

test("cuts a single long word", () => {
  expect(slugify("supercalifragilistic", { maxLength: 5 })).toBe("super")
})

test("custom separator", () => {
  expect(slugify("Hello World", { separator: "_" })).toBe("hello_world")
})

test("empty input", () => {
  expect(slugify("   ")).toBe("")
})
