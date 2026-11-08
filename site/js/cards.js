// Renders fold-over cards: each strip is front | back, 5 strips per A4 sheet.
// Styling lives in css/cards.css.
import { addYears, chunk, formatDMY, formatNumber } from "./lib.js";

export const STRIPS_PER_SHEET = 5;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const row = (label, value) => `<div class="row"><span class="lbl">${label}</span><span class="colon">：</span>${value}</div>`;

function front({ name, number, issueDate }) {
  const len = [...name].length;
  return `<div class="half face front">
      <div class="seal">會員證</div>
      <div class="head">
        <img class="card-logo" src="assets/logo.png" alt="">
        <div class="club">澳門中國民族服飾<br>愛好者協會</div>
      </div>
      <div class="brush"></div>
      ${row("姓名", `<span class="name" data-len="${len}">${escapeHtml(name)}</span>`)}
      ${row("會員編號", number == null ? '<span class="pending">待定</span>' : formatNumber(number))}
      ${row("簽發日期", formatDMY(issueDate))}
    </div>`;
}

// The back carries one thing: the 有效日期, or 永久會員, over a faint club stamp.
function back({ issueDate, expiryDate, lifetime }) {
  const content = lifetime
    ? '<div class="lifetime-text">永久會員</div>'
    : `<div class="expiry-label">有效日期</div><div class="expiry-date">${formatDMY(expiryDate || addYears(issueDate, 1))}</div>`;
  return `<div class="half face back"><img class="watermark" src="assets/stamp.png" alt="">${content}</div>`;
}

export function renderSheets(cards) {
  return chunk(cards, STRIPS_PER_SHEET)
    .map((sheet) => `<section class="sheet">${sheet.map((c) => `<div class="strip">${front(c)}${back(c)}</div>`).join("")}</section>`)
    .join("");
}
