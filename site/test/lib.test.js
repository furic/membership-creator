import test from "node:test";
import assert from "node:assert/strict";
import { addYears, formatDMY, parseNames, formatNumber, chunk, todayISO } from "../js/lib.js";

test("addYears keeps the day, and 29/02 falls back to 28/02", () => {
  assert.equal(addYears("2027-11-03", 1), "2028-11-03");
  assert.equal(addYears("2028-02-29", 1), "2029-02-28");
  assert.equal(addYears("2028-02-29", 4), "2032-02-29");
});

test("formatDMY", () => {
  assert.equal(formatDMY("2027-11-03"), "03/11/2027");
});

test("parseNames trims spaces, full-width spaces and blank lines", () => {
  assert.deepEqual(parseNames(" 陳大文 \r\n\n　李小梅　\n"), ["陳大文", "李小梅"]);
  assert.deepEqual(parseNames(""), []);
});

test("formatNumber pads to 3 digits", () => {
  assert.equal(formatNumber(1), "001");
  assert.equal(formatNumber(42), "042");
  assert.equal(formatNumber(1000), "1000");
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7], 5), [[1, 2, 3, 4, 5], [6, 7]]);
  assert.deepEqual(chunk([], 5), []);
});

test("todayISO is a local YYYY-MM-DD date", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
