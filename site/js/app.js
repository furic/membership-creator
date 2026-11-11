// Screens: login → new members / member list / settings. Cards are printed from #print-root.
import * as api from "./api.js";
import { renderSheets, STRIPS_PER_SHEET } from "./cards.js";
import { config, defaultExpiry, fmtDate, fmtNumber, loadConfig } from "./config.js";
import { loadMessages, t, translatePage } from "./i18n.js";
import { escapeHtml, parseNames, todayISO } from "./lib.js";

const $ = (id) => document.getElementById(id);

// ---------- start-up: config.json, then the language file, then the page ----------

try {
  await loadConfig();
  const locale = await loadMessages(config.locale);
  document.documentElement.lang = config.locale.startsWith(locale) ? config.locale : locale;
  document.documentElement.dataset.cardStyle = t("_cardStyle") === "latin" ? "latin" : "cjk";
  translatePage();
} catch (err) {
  document.body.textContent = `Could not start: ${err.message}`;
  throw err;
}

document.title = t("app.title");
$("club-name").textContent = config.clubName;
$("pc-username").value = config.clubName || "membership";
if (config.logo) Object.assign($("club-logo"), { src: config.logo, hidden: false });
if (config.favicon) document.querySelector('link[rel="icon"]').href = config.favicon;
const rootStyle = document.documentElement.style;
if (config.cardColor) rootStyle.setProperty("--card-color", config.cardColor);
if (config.appColor) rootStyle.setProperty("--ink", config.appColor);

const views = ["login", "issue", "register", "settings"];

// ---------- shared ----------

const numberRange = (first, last) => (first === last ? fmtNumber(first) : `${fmtNumber(first)}–${fmtNumber(last)}`);

let statusTimer;
function showStatus(message, kind = "info") {
  const el = $("status");
  el.textContent = message;
  el.className = `status ${kind}`;
  el.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.hidden = true), 6000);
}

function handleError(err) {
  if (err instanceof api.AuthError) {
    api.passcode.clear();
    show("login");
    $("login-error").textContent = t("login.expired");
    $("login-error").hidden = false;
    return;
  }
  showStatus(err.message, "error");
}

function show(view) {
  for (const v of views) $(`view-${v}`).hidden = v !== view;
  document.querySelector(".tabs").hidden = view === "login";
  for (const tab of document.querySelectorAll(".tab[data-view]")) tab.classList.toggle("active", tab.dataset.view === view);
  if (view === "register") loadMembers();
  if (view === "issue" && !issued) refreshNextNumber();
  if (view === "settings") openSettings();
  if (view === "login") $("login-code").focus();
}

async function printCards(cards) {
  const root = $("print-root");
  root.innerHTML = renderSheets(cards);
  await Promise.all([...root.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
  await document.fonts.ready;
  window.print();
}

// ---------- login ----------

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("login-code").value.trim();
  const btn = e.submitter;
  btn.disabled = true;
  $("login-error").hidden = true;
  try {
    await api.ping(code);
    api.passcode.set(code);
    $("login-code").value = "";
    show("issue");
  } catch (err) {
    $("login-error").textContent = err instanceof api.AuthError ? t("error.wrongPasscode") : err.message;
    $("login-error").hidden = false;
  } finally {
    btn.disabled = false;
  }
});

for (const tab of document.querySelectorAll(".tab[data-view]")) tab.addEventListener("click", () => show(tab.dataset.view));

// ---------- new members ----------

let issued = null; // members returned by the API for the current batch
let issuing = false;
let nextNumber = null; // expected number of the first name, for the preview

async function refreshNextNumber() {
  try {
    nextNumber = await api.nextNumber();
    $("next-number").textContent = fmtNumber(nextNumber);
  } catch (err) {
    nextNumber = null;
    if (err instanceof api.AuthError) return handleError(err);
  }
  refreshIssue();
}

function draftCards() {
  const issueDate = todayISO();
  const lifetime = $("lifetime").checked;
  const expiryDate = lifetime ? null : $("expiry").value || defaultExpiry(issueDate);
  return parseNames($("names").value).map((name, i) => ({
    name,
    number: nextNumber == null ? null : nextNumber + i,
    issueDate,
    expiryDate,
    lifetime,
  }));
}

function refreshIssue() {
  const cards = issued ?? draftCards();
  $("issue-preview").innerHTML = cards.length ? renderSheets(cards) : `<p class="hint">${escapeHtml(t("issue.emptyPreview"))}</p>`;

  const lifetime = issued ? issued[0].lifetime : $("lifetime").checked;
  if (lifetime) {
    $("expiry-hint").textContent = t("issue.lifetimeHint");
  } else {
    const first = issued ? issued[0].expiryDate : $("expiry").value || defaultExpiry(todayISO());
    const date = fmtDate(first);
    $("expiry-hint").textContent =
      issued || $("expiry").value ? t("issue.expiryHint", { date }) : t("issue.expiryDefault", { count: config.validityYears, date });
  }
  const sheets =
    t("issue.members", { count: cards.length }) + t("issue.sheets", { count: Math.ceil(cards.length / STRIPS_PER_SHEET) });
  const expected =
    !issued && cards.length && nextNumber != null
      ? t("issue.expected", { range: numberRange(nextNumber, nextNumber + cards.length - 1) })
      : "";
  $("count-hint").textContent = cards.length ? sheets + expected : "";

  $("issue-btn").hidden = Boolean(issued);
  $("issue-btn").disabled = issuing || !cards.length;
  $("print-btn").hidden = !issued;
  $("new-batch-btn").hidden = !issued;
  $("names").readOnly = Boolean(issued);
  $("expiry").disabled = Boolean(issued) || lifetime;
  $("lifetime").disabled = Boolean(issued);
}

$("names").addEventListener("input", refreshIssue);
$("expiry").addEventListener("input", refreshIssue);
$("lifetime").addEventListener("change", refreshIssue);

$("issue-btn").addEventListener("click", async () => {
  const cards = draftCards();
  if (!cards.length || issuing) return;
  issuing = true;
  refreshIssue();
  try {
    const { issueDate, expiryDate, lifetime } = cards[0];
    issued = await api.issue(cards.map((c) => c.name), issueDate, expiryDate, lifetime);
    $("issued-msg").textContent = t("issue.done", { range: numberRange(issued[0].number, issued.at(-1).number) });
  } catch (err) {
    handleError(err);
  } finally {
    issuing = false;
    refreshIssue();
  }
});

window.addEventListener("focus", () => {
  if (!$("view-issue").hidden && !issued) refreshNextNumber();
});

$("print-btn").addEventListener("click", () => printCards(issued));

$("new-batch-btn").addEventListener("click", () => {
  issued = null;
  $("names").value = "";
  $("expiry").value = "";
  $("lifetime").checked = false;
  $("issued-msg").textContent = "";
  refreshIssue();
  refreshNextNumber();
  $("names").focus();
});

// ---------- member list ----------

let members = [];
const selected = new Set();
let searchTimer;
let loadSeq = 0;

async function loadMembers() {
  const seq = ++loadSeq;
  try {
    const result = await api.list($("search").value.trim());
    if (seq !== loadSeq) return;
    members = result;
    renderMembers();
  } catch (err) {
    handleError(err);
  }
}

function renderMembers() {
  $("members").innerHTML = members
    .map(
      (m) => `<tr>
        <td><input type="checkbox" data-select="${m.number}" ${selected.has(m.number) ? "checked" : ""}></td>
        <td>${fmtNumber(m.number)}</td>
        <td>${escapeHtml(m.name)}</td>
        <td>${fmtDate(m.issueDate)}</td>
        <td>${m.lifetime ? escapeHtml(t("member.lifetime")) : fmtDate(m.expiryDate)}</td>
        <td class="row-actions">
          <button type="button" data-edit="${m.number}">${escapeHtml(t("register.edit"))}</button>
          <button type="button" class="danger" data-delete="${m.number}">${escapeHtml(t("register.delete"))}</button>
        </td>
      </tr>`,
    )
    .join("");
  $("empty").hidden = members.length > 0;
  const visibleSelected = members.filter((m) => selected.has(m.number)).length;
  $("select-all").checked = members.length > 0 && visibleSelected === members.length;
  $("reprint-btn").disabled = selected.size === 0;
  $("reprint-btn").textContent = selected.size ? t("register.reprintCount", { count: selected.size }) : t("register.reprint");
}

$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadMembers, 250);
});

$("select-all").addEventListener("change", (e) => {
  for (const m of members) e.target.checked ? selected.add(m.number) : selected.delete(m.number);
  renderMembers();
});

const memberCache = new Map(); // keeps selected members printable after the search changes

$("members").addEventListener("change", (e) => {
  const number = Number(e.target.dataset.select);
  if (!number) return;
  const m = members.find((x) => x.number === number);
  if (e.target.checked) {
    selected.add(number);
    memberCache.set(number, m);
  } else {
    selected.delete(number);
  }
  renderMembers();
});

$("members").addEventListener("click", async (e) => {
  const editNo = Number(e.target.dataset.edit);
  const deleteNo = Number(e.target.dataset.delete);
  const m = members.find((x) => x.number === (editNo || deleteNo));
  if (!m) return;
  if (editNo) return openEdit(m);
  if (!confirm(t("register.confirmDelete", { number: fmtNumber(m.number), name: m.name }))) return;
  try {
    await api.remove(m.number);
    selected.delete(m.number);
    memberCache.delete(m.number);
    showStatus(t("register.deleted", { number: fmtNumber(m.number), name: m.name }));
    await loadMembers();
  } catch (err) {
    handleError(err);
  }
});

// ---------- edit a member ----------

let editing = null; // the member being edited, as loaded

function openEdit(m) {
  editing = m;
  $("edit-number").value = fmtNumber(m.number);
  $("edit-name").value = m.name;
  $("edit-lifetime").checked = m.lifetime;
  $("edit-expiry").value = m.expiryDate ?? defaultExpiry(m.issueDate);
  showFormError("edit-error", "");
  refreshEditHint();
  $("edit-dialog").showModal();
}

function refreshEditHint() {
  const lifetime = $("edit-lifetime").checked;
  const first = $("edit-expiry").value;
  $("edit-expiry").disabled = lifetime;
  $("edit-expiry").required = !lifetime;
  $("edit-hint").textContent = lifetime
    ? t("edit.lifetimeHint")
    : first
      ? t("edit.expiryHint", { date: fmtDate(first) })
      : "";
}

$("edit-lifetime").addEventListener("change", refreshEditHint);
$("edit-expiry").addEventListener("input", refreshEditHint);
$("edit-cancel").addEventListener("click", () => $("edit-dialog").close());

$("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const m = editing;
  const input = $("edit-number").value.trim();
  const number = /^\d+$/.test(input) ? Number(input) : NaN;
  if (!Number.isInteger(number) || number < 1 || number > 99999) return showFormError("edit-error", t("error.numberRange"));
  const name = $("edit-name").value.trim();
  if (!name) return showFormError("edit-error", t("error.nameRequired"));
  const lifetime = $("edit-lifetime").checked;
  const expiryDate = $("edit-expiry").value;
  if (!lifetime && !expiryDate) return showFormError("edit-error", t("error.expiryRequired"));

  const patch = {};
  if (number !== m.number) patch.number = number;
  if (name !== m.name) patch.name = name;
  if (lifetime !== m.lifetime || (!lifetime && expiryDate !== m.expiryDate)) {
    patch.lifetime = lifetime;
    if (!lifetime) patch.expiryDate = expiryDate;
  }
  if (!Object.keys(patch).length) return $("edit-dialog").close();

  const btn = e.submitter;
  btn.disabled = true;
  showFormError("edit-error", "");
  try {
    const updated = await api.update(m.number, patch);
    if (selected.delete(m.number)) selected.add(updated.number);
    memberCache.delete(m.number);
    if (selected.has(updated.number)) memberCache.set(updated.number, updated);
    $("edit-dialog").close();
    showStatus(t("edit.updated", { number: fmtNumber(updated.number), name: updated.name }));
    await loadMembers();
  } catch (err) {
    if (err.status === 409) {
      const vars = { number: fmtNumber(number), name: err.data?.name };
      showFormError("edit-error", t(err.data?.name ? "error.numberTaken" : "error.numberTakenUnknown", vars));
    } else if (err instanceof api.AuthError) {
      $("edit-dialog").close();
      handleError(err);
    } else {
      showFormError("edit-error", err.message);
    }
  } finally {
    btn.disabled = false;
  }
});

$("reprint-btn").addEventListener("click", () => {
  for (const m of members) if (selected.has(m.number)) memberCache.set(m.number, m);
  const cards = [...selected].sort((a, b) => a - b).map((n) => memberCache.get(n)).filter(Boolean);
  printCards(cards);
});

// ---------- settings ----------

function showFormError(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
}

async function openSettings() {
  showFormError("next-error", "");
  showFormError("pc-error", "");
  $("next-input").value = "";
  try {
    $("next-input").value = fmtNumber(await api.nextNumber());
  } catch (err) {
    handleError(err);
  }
}

$("next-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("next-input").value.trim();
  const next = /^\d+$/.test(input) ? Number(input) : NaN;
  if (!Number.isInteger(next) || next < 1 || next > 99999) return showFormError("next-error", t("error.numberRange"));
  const btn = e.submitter;
  btn.disabled = true;
  showFormError("next-error", "");
  try {
    await api.setNextNumber(next);
    $("next-input").value = fmtNumber(next);
    showStatus(t("settings.nextSaved", { number: fmtNumber(next) }));
  } catch (err) {
    if (err.status === 409) showFormError("next-error", t("error.nextTooLow", { number: fmtNumber(err.data.highest) }));
    else handleError(err);
  } finally {
    btn.disabled = false;
  }
});

$("passcode-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const current = $("pc-current").value.trim();
  const next = $("pc-next").value.trim();
  if (next !== $("pc-confirm").value.trim()) return showFormError("pc-error", t("error.passcodeMismatch"));
  if (next.length < 6 || next.length > 64 || !/^[\x20-\x7e]+$/.test(next)) {
    return showFormError("pc-error", t("error.passcodeRule"));
  }
  if (next === current) return showFormError("pc-error", t("error.passcodeSame"));
  const btn = e.submitter;
  btn.disabled = true;
  showFormError("pc-error", "");
  try {
    await api.changePasscode(current, next);
    api.passcode.set(next);
    e.target.reset();
    showStatus(t("settings.pcSaved"));
  } catch (err) {
    if (err.status === 403) showFormError("pc-error", t("error.passcodeWrongCurrent"));
    else if (err.status === 400) showFormError("pc-error", t("error.passcodeRule"));
    else handleError(err);
  } finally {
    btn.disabled = false;
  }
});

// ---------- start ----------

refreshIssue();
show(api.passcode.get() ? "issue" : "login");
