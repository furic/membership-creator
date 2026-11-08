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

export function formatDMY(iso) {
  const { y, m, d } = parseISO(iso);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function parseNames(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function formatNumber(n) {
  return pad(n, 3);
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
