// Renders fold-over cards: each strip is front | back, 5 strips per A4 sheet.
// Styling lives in css/cards.css; the club details come from config.json, the labels from locales/.
import { cardClubLines, config, defaultExpiry, fmtDate, fmtNumber } from "./config.js";
import { t } from "./i18n.js";
import { chunk, escapeHtml, visualLength } from "./lib.js";

export const STRIPS_PER_SHEET = 5;

const row = (label, value) =>
  `<div class="row"><span class="lbl">${escapeHtml(label)}</span><span class="colon">${escapeHtml(t("card.colon"))}</span>${value}</div>`;

function front({ name, number, issueDate }) {
  const len = visualLength(name);
  const club = cardClubLines().map(escapeHtml).join("<br>");
  return `<div class="half face front">
      <div class="seal">${escapeHtml(t("card.seal"))}</div>
      <div class="head">
        ${config.logo ? `<img class="card-logo" src="${escapeHtml(config.logo)}" alt="">` : ""}
        <div class="club">${club}</div>
      </div>
      <div class="brush"></div>
      ${row(t("card.name"), `<span class="name" data-len="${len}" style="--len: ${len}">${escapeHtml(name)}</span>`)}
      ${row(t("card.number"), number == null ? `<span class="pending">${escapeHtml(t("card.pending"))}</span>` : fmtNumber(number))}
      ${row(t("card.issued"), fmtDate(issueDate))}
    </div>`;
}

// The back: the expiry date (or "lifetime member") over a faint club stamp, and the club phone at the bottom.
function back({ issueDate, expiryDate, lifetime }) {
  const content = lifetime
    ? `<div class="lifetime-text">${escapeHtml(t("card.lifetime"))}</div>`
    : `<div class="expiry-label">${escapeHtml(t("card.expiry"))}</div><div class="expiry-date">${fmtDate(expiryDate || defaultExpiry(issueDate))}</div>`;
  const stamp = config.stamp ? `<img class="watermark" src="${escapeHtml(config.stamp)}" alt="">` : "";
  const phone = config.phone ? `<div class="phone">${escapeHtml(t("card.phone", { phone: config.phone }))}</div>` : "";
  return `<div class="half face back">${stamp}${content}${phone}</div>`;
}

export function renderSheets(cards) {
  return chunk(cards, STRIPS_PER_SHEET)
    .map((sheet) => `<section class="sheet">${sheet.map((c) => `<div class="strip">${front(c)}${back(c)}</div>`).join("")}</section>`)
    .join("");
}
