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

test("front shows the issue date, back shows three yearly expiry dates", () => {
  const html = renderSheets([card()]);
  for (const d of ["04/11/2026", "03/11/2027", "03/11/2028", "03/11/2029"]) assert.ok(html.includes(d), d);
});

test("names are HTML-escaped", () => {
  const html = renderSheets([card({ name: "<b>陳</b>" })]);
  assert.ok(html.includes("&lt;b&gt;陳&lt;/b&gt;"));
  assert.ok(!html.includes("<b>陳"));
});

test("no cards renders nothing", () => {
  assert.equal(renderSheets([]), "");
});
