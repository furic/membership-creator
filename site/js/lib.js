// Pure helpers shared by the page and its tests. Dates are ISO "YYYY-MM-DD" strings,
// handled as plain numbers so timezones never shift a day.

const pad = (n, width = 2) => String(n).padStart(width, "0");

const parseISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addYears(iso, n) {
  const { y, m, d } = parseISO(iso);
  const year = y + n;
  return `${year}-${pad(m)}-${pad(Math.min(d, daysInMonth(year, m)))}`;
}

// `format` uses the tokens DD, MM and YYYY, e.g. "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D.M.YYYY".
export function formatDate(iso, format = "DD/MM/YYYY") {
  const { y, m, d } = parseISO(iso);
  return format.replace(/YYYY|DD|MM|D|M/g, (tok) => ({ YYYY: y, DD: pad(d), MM: pad(m), D: d, M: m })[tok]);
}

export function parseNames(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function formatNumber(n, digits = 3) {
  return pad(n, digits);
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// CJK and full-width characters, which print about twice as wide as Latin letters.
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u;

// A name's printed width in CJK characters, rounded up: "陳大文" is 3, "jane smith" is 5.
// Capitals and digits print wider than lower case.
export function visualLength(name) {
  const width = (ch) => (WIDE.test(ch) ? 1 : /[A-Z0-9]/.test(ch) ? 0.65 : 0.5);
  return Math.ceil([...name].reduce((sum, ch) => sum + width(ch), 0));
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
