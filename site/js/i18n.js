// Page text. Each language is a flat JSON file in locales/; en.json is loaded first, so a
// language file that misses a key shows the English text instead of the key.

let messages = {};

// Later sets win. A set that gives "key" but no "key_one" also drops an inherited "key_one",
// so English's "1 A4 sheet" never shows through a language without singular forms.
export function setMessages(...sets) {
  messages = {};
  for (const set of sets) {
    for (const [key, value] of Object.entries(set)) {
      if (!key.endsWith("_one") && !(`${key}_one` in set)) delete messages[`${key}_one`];
      messages[key] = value;
    }
  }
}

// t("issue.done", { range: "001–003" }). With a `count`, "<key>_one" is used for 1 when it exists.
export function t(key, vars = {}) {
  const k = vars.count === 1 && `${key}_one` in messages ? `${key}_one` : key;
  const text = messages[k] ?? key;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
}

async function fetchLocale(name) {
  try {
    const res = await fetch(`locales/${name}.json`, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// "zh-Hant-MO" tries zh-Hant-MO.json, zh-Hant.json, then zh.json.
export async function loadMessages(locale) {
  const parts = locale.split("-");
  const english = await fetchLocale("en");
  for (let i = parts.length; i > 0; i--) {
    const name = parts.slice(0, i).join("-");
    const found = name === "en" ? english : await fetchLocale(name);
    if (found) {
      setMessages(english ?? {}, found);
      return name;
    }
  }
  if (!english) throw new Error("locales/en.json could not be loaded");
  setMessages(english);
  return "en";
}

// Fills elements marked data-i18n (text), data-i18n-placeholder and data-i18n-label (aria-label).
export function translatePage(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", t(el.dataset.i18nLabel));
}
