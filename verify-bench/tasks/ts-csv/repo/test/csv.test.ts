import { expect, test } from "bun:test"
import { parseCSV, parseCSVWithHeader } from "../src/csv"

test("simple rows", () => {
  expect(parseCSV("a,b,c\n1,2,3")).toEqual([
    ["a", "b", "c"],
    ["1", "2", "3"],
  ])
})

test("trailing newline ignored", () => {
  expect(parseCSV("a,b\n")).toEqual([["a", "b"]])
})

test("empty fields kept", () => {
  expect(parseCSV("a,,c\n,,")).toEqual([
    ["a", "", "c"],
    ["", "", ""],
  ])
})

test("blank line in the middle is a row with one empty field", () => {
  expect(parseCSV("a,b\n\nc,d")).toEqual([["a", "b"], [""], ["c", "d"]])
})

test("empty input", () => {
  expect(parseCSV("")).toEqual([])
})

test("whitespace inside fields is preserved", () => {
  expect(parseCSV(" a , b ")).toEqual([[" a ", " b "]])
})

test("header mapping trims header names and fills missing columns", () => {
  expect(parseCSVWithHeader(" name , age \nann,30\nbob")).toEqual([
    { name: "ann", age: "30" },
    { name: "bob", age: "" },
  ])
})

test("header only", () => {
  expect(parseCSVWithHeader("name,age\n")).toEqual([])
})
