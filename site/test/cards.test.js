import test from "node:test";
import assert from "node:assert/strict";
import { renderSheets } from "../js/cards.js";

const card = (over = {}) => ({ name: "陳大文", number: 1, issueDate: "2026-11-04", expiryDate: "2027-11-03", ...over });
const count = (html, needle) => html.split(needle).length - 1;

test("5 strips per A4 sheet", () => {
  const html = renderSheets(Array.from({ length: 7 }, (_, i) => card({ number: i + 1 })));
  assert.equal(count(html, 'class="sheet"'), 2);
  assert.equal(count(html, 'class="strip"'), 7);
});

test("numbers are padded, and unassigned ones show 待定", () => {
  assert.ok(renderSheets([card({ number: 5 })]).includes("005"));
  assert.ok(renderSheets([card({ number: null })]).includes("待定"));
});

test("front shows the issue date, back shows the one expiry date", () => {
  const html = renderSheets([card()]);
  for (const d of ["04/11/2026", "03/11/2027"]) assert.ok(html.includes(d), d);
  assert.ok(!html.includes("03/11/2028"));
  assert.equal(count(html, "有效日期"), 1);
});

test("cards have no signature lines", () => {
  const html = renderSheets([card(), card({ lifetime: true, expiryDate: null })]);
  assert.ok(!html.includes("簽名"));
});

test("lifetime cards show 永久會員 on the back instead of expiry dates", () => {
  const html = renderSheets([card({ lifetime: true, expiryDate: null })]);
  assert.ok(html.includes("永久會員"));
  assert.ok(!html.includes("有效日期"));
  assert.ok(html.includes("04/11/2026"));
});

test("names are HTML-escaped", () => {
  const html = renderSheets([card({ name: "<b>陳</b>" })]);
  assert.ok(html.includes("&lt;b&gt;陳&lt;/b&gt;"));
  assert.ok(!html.includes("<b>陳"));
});

test("no cards renders nothing", () => {
  assert.equal(renderSheets([]), "");
});
