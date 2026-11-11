import test from "node:test";
import assert from "node:assert/strict";
import { addYears, formatDate, parseNames, formatNumber, chunk, todayISO, visualLength } from "../js/lib.js";

test("addYears keeps the day, and 29/02 falls back to 28/02", () => {
  assert.equal(addYears("2027-11-03", 1), "2028-11-03");
  assert.equal(addYears("2028-02-29", 1), "2029-02-28");
  assert.equal(addYears("2028-02-29", 4), "2032-02-29");
});

test("formatDate", () => {
  assert.equal(formatDate("2027-11-03"), "03/11/2027");
  assert.equal(formatDate("2027-11-03", "MM/DD/YYYY"), "11/03/2027");
  assert.equal(formatDate("2027-11-03", "YYYY-MM-DD"), "2027-11-03");
  assert.equal(formatDate("2027-01-03", "D.M.YYYY"), "3.1.2027");
});

test("parseNames trims spaces, full-width spaces and blank lines", () => {
  assert.deepEqual(parseNames(" 陳大文 \r\n\n　李小梅　\n"), ["陳大文", "李小梅"]);
  assert.deepEqual(parseNames(""), []);
});

test("formatNumber pads to 3 digits", () => {
  assert.equal(formatNumber(1), "001");
  assert.equal(formatNumber(42), "042");
  assert.equal(formatNumber(1000), "1000");
  assert.equal(formatNumber(7, 4), "0007");
});

test("visualLength counts CJK as 1, Latin lower case as half, capitals a bit more", () => {
  assert.equal(visualLength("陳大文"), 3);
  assert.equal(visualLength("jane smith"), 5);
  assert.equal(visualLength("Jane Smith"), 6);
  assert.equal(visualLength("JANE SMITH"), 7);
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7], 5), [[1, 2, 3, 4, 5], [6, 7]]);
  assert.deepEqual(chunk([], 5), []);
});

test("todayISO is a local YYYY-MM-DD date", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
