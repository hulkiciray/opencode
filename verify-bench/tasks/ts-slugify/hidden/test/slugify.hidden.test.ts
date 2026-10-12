import { expect, test } from "bun:test"
import { slugify } from "../src/slugify"

test("accents", () => {
  expect(slugify("Crème Brûlée")).toBe("creme-brulee")
  expect(slugify("Señor Müller")).toBe("senor-muller")
})

test("special latin letters", () => {
  expect(slugify("Straße")).toBe("strasse")
  expect(slugify("Æble Øl Œuvre")).toBe("aeble-ol-oeuvre")
})

test("emoji and symbols dropped", () => {
  expect(slugify("I ❤️ pizza 🍕!")).toBe("i-pizza")
  expect(slugify("50% off — today™")).toBe("50-off-today")
})

test("underscores separate words", () => {
  expect(slugify("foo_bar baz")).toBe("foo-bar-baz")
  expect(slugify("foo_bar baz", { separator: "_" })).toBe("foo_bar_baz")
  expect(slugify("__init__")).toBe("init")
})

test("maxLength applies after transliteration", () => {
  expect(slugify("Ærøskøbing havn", { maxLength: 10 })).toBe("aeroskobin")
  expect(slugify("Straße und Weg", { maxLength: 11 })).toBe("strasse-und")
})
