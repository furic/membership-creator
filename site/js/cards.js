// Renders fold-over cards: each strip is front | back, 5 strips per A4 sheet.
// Styling lives in css/cards.css.
import { chunk, expiryDates, formatDMY, formatNumber } from "./lib.js";

export const STRIPS_PER_SHEET = 5;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const row = (label, value) => `<div class="row"><span class="lbl">${label}</span>：${value}</div>`;
const signature = row("簽名", '<span class="line"></span>');

function front({ name, number, issueDate }) {
  const len = [...name].length;
  return `<div class="half"><div class="face front">
      <div class="head">
        <img class="card-logo" src="assets/logo.png" alt="">
        <div class="club">澳門中國民族服飾<br>愛好者協會</div>
      </div>
      <div class="title">會員證</div>
      ${row("姓名", `<span class="name" data-len="${len}">${escapeHtml(name)}</span>`)}
      ${row("會員編號", number == null ? '<span class="pending">待定</span>' : formatNumber(number))}
      ${row("簽發日期", formatDMY(issueDate))}
      ${signature}
    </div></div>`;
}

function back({ issueDate, expiryDate, lifetime }) {
  if (lifetime) return '<div class="half"><div class="face back lifetime"><div class="lifetime-text">永久會員</div></div></div>';
  const periods = expiryDates(issueDate, expiryDate).map(
    (d) => `<div class="period">${row("有效日期", formatDMY(d))}${signature}</div>`,
  );
  return `<div class="half"><div class="face back">${periods.join("")}</div></div>`;
}

export function renderSheets(cards) {
  return chunk(cards, STRIPS_PER_SHEET)
    .map((sheet) => `<section class="sheet">${sheet.map((c) => `<div class="strip">${front(c)}${back(c)}</div>`).join("")}</section>`)
    .join("");
}
