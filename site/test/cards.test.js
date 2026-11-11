import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderSheets } from "../js/cards.js";
import { applyConfig } from "../js/config.js";
import { setMessages } from "../js/i18n.js";

const locale = (name) => JSON.parse(readFileSync(new URL(`../locales/${name}.json`, import.meta.url), "utf8"));
const en = locale("en");
const zh = locale("zh-Hant");

// A fixed club, so the tests don't depend on what a fork puts in config.json.
const CLUB = { clubName: "測試協會", cardClubName: ["測試", "協會"], phone: "1234 5678" };

function useLocale(messages, extra = {}) {
  applyConfig({ ...CLUB, ...extra });
  setMessages(en, messages);
}

const card = (over = {}) => ({ name: "陳大文", number: 1, issueDate: "2026-11-04", expiryDate: "2027-11-03", ...over });
const count = (html, needle) => html.split(needle).length - 1;

test.beforeEach(() => useLocale(zh));

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

test("the back shows the club phone number, for yearly and lifetime members", () => {
  for (const c of [card(), card({ lifetime: true, expiryDate: null })]) {
    const html = renderSheets([c]);
    assert.ok(html.includes("電話：1234 5678"));
  }
});

test("names are HTML-escaped", () => {
  const html = renderSheets([card({ name: "<b>陳</b>" })]);
  assert.ok(html.includes("&lt;b&gt;陳&lt;/b&gt;"));
  assert.ok(!html.includes("<b>陳"));
});

test("no cards renders nothing", () => {
  assert.equal(renderSheets([]), "");
});

test("the club name prints one line per cardClubName entry, escaped", () => {
  assert.ok(renderSheets([card()]).includes("測試<br>協會"));
  useLocale(zh, { cardClubName: null, clubName: "A & B Club" });
  assert.ok(renderSheets([card()]).includes('<div class="club">A &amp; B Club</div>'));
});

test("config sets the number width, date format, default validity, and optional phone and stamp", () => {
  useLocale(zh, { numberDigits: 4, dateFormat: "YYYY-MM-DD", validityYears: 2, phone: "", stamp: "" });
  const html = renderSheets([card({ number: 7, expiryDate: null })]);
  assert.ok(html.includes("0007"));
  assert.ok(html.includes("2026-11-04"));
  assert.ok(html.includes("2028-11-04"), "issue date + 2 years");
  assert.ok(!html.includes('class="phone"'));
  assert.ok(!html.includes('class="watermark"'));
});

test("English labels", () => {
  useLocale(en, { clubName: "Riverside Folk Club", cardClubName: null, phone: "555 0100" });
  const html = renderSheets([card({ name: "Jane Smith", number: null }), card({ lifetime: true, expiryDate: null })]);
  for (const s of ["MEMBER", "Name:", "Number:", "Issued:", "TBD", "Valid until", "Lifetime member", "Tel: 555 0100"]) assert.ok(html.includes(s), s);
  assert.ok(!/[一-鿿]/.test(html.replace(/陳大文/g, "")), "no Chinese text left on English cards");
});

test("the two locale files have the same keys", () => {
  const plain = (m) => Object.keys(m).filter((k) => !k.endsWith("_one")).sort();
  assert.deepEqual(plain(zh), plain(en));
});
