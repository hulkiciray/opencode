import { expect, test } from "bun:test"
import { parseCSV, parseCSVWithHeader } from "../src/csv"

test("quoted field with comma", () => {
  expect(parseCSV('a,"b,c",d')).toEqual([["a", "b,c", "d"]])
})

test("escaped quotes", () => {
  expect(parseCSV('"say ""hi""",x')).toEqual([['say "hi"', "x"]])
})

test("newline inside quotes", () => {
  expect(parseCSV('id,note\n1,"line one\nline two"\n2,ok')).toEqual([
    ["id", "note"],
    ["1", "line one\nline two"],
    ["2", "ok"],
  ])
})

test("quoted empty field", () => {
  expect(parseCSV('a,"",c')).toEqual([["a", "", "c"]])
})

test("CRLF line endings", () => {
  expect(parseCSV("a,b\r\n1,2\r\n")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ])
})

test("CRLF inside quotes is kept", () => {
  expect(parseCSV('"x\r\ny",z\r\n')).toEqual([["x\r\ny", "z"]])
})

test("header with quoted names", () => {
  expect(parseCSVWithHeader('"full name",amount\r\n"Doe, Jane","1,200"\r\n')).toEqual([
    { "full name": "Doe, Jane", amount: "1,200" },
  ])
})
