// Per-club settings, loaded from config.json when the page starts. See "Configuration" in README.md.
import { addYears, formatDate, formatNumber } from "./lib.js";

export const DEFAULTS = {
  apiBase: "", // the members Worker, e.g. https://membership-api.<account>.workers.dev
  locale: "en", // a file in locales/; "zh-Hant-MO" falls back to zh-Hant.json
  clubName: "",
  cardClubName: null, // the club name on the card, one string per line; defaults to clubName
  phone: "", // printed on the back of every card; empty leaves it off
  logo: "assets/logo.png",
  stamp: "assets/stamp.png", // faint watermark on the back; empty leaves it off
  favicon: "assets/favicon.png",
  cardColor: "#a3302f",
  appColor: "#543c7d",
  numberDigits: 3, // 1 → 001
  validityYears: 1, // default expiry when the date is left empty
  dateFormat: "DD/MM/YYYY",
};

export const config = { ...DEFAULTS };

export function applyConfig(values = {}) {
  Object.assign(config, DEFAULTS, values);
}

export const fmtNumber = (n) => formatNumber(n, config.numberDigits);
export const fmtDate = (iso) => formatDate(iso, config.dateFormat);
export const defaultExpiry = (issueDate) => addYears(issueDate, config.validityYears);
export const cardClubLines = () => (config.cardClubName?.length ? config.cardClubName : [config.clubName]);

export async function loadConfig() {
  const res = await fetch("config.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`config.json: HTTP ${res.status}`);
  applyConfig(await res.json());

  const params = new URLSearchParams(location.search);
  // `?api=http://127.0.0.1:8787` points a local copy at a local Worker — only on localhost,
  // so a crafted link can't send the passcode elsewhere.
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (isLocal && params.get("api")) config.apiBase = params.get("api");
  // `?lang=en` previews another language.
  const lang = params.get("lang");
  if (lang && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) config.locale = lang;
}
