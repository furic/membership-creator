// Screens: 輸入密碼 → 新增會員 / 會員名單 / 設定. Cards are printed from #print-root.
import * as api from "./api.js";
import { renderSheets } from "./cards.js";
import { addYears, formatDMY, formatNumber, parseNames, todayISO } from "./lib.js";

const $ = (id) => document.getElementById(id);
const views = ["login", "issue", "register", "settings"];

// ---------- shared ----------

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
    $("login-error").textContent = "密碼已失效，請重新輸入。";
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

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- 輸入密碼 ----------

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
    $("login-error").textContent = err instanceof api.AuthError ? "密碼錯誤" : err.message;
    $("login-error").hidden = false;
  } finally {
    btn.disabled = false;
  }
});

for (const tab of document.querySelectorAll(".tab[data-view]")) tab.addEventListener("click", () => show(tab.dataset.view));

// ---------- 新增會員 ----------

let issued = null; // members returned by the API for the current batch
let issuing = false;
let nextNumber = null; // expected number of the first name, for the preview

async function refreshNextNumber() {
  try {
    nextNumber = await api.nextNumber();
    $("next-number").textContent = formatNumber(nextNumber);
  } catch (err) {
    nextNumber = null;
    if (err instanceof api.AuthError) return handleError(err);
  }
  refreshIssue();
}

function draftCards() {
  const issueDate = todayISO();
  const lifetime = $("lifetime").checked;
  const expiryDate = lifetime ? null : $("expiry").value || addYears(issueDate, 1);
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
  $("issue-preview").innerHTML = cards.length ? renderSheets(cards) : '<p class="hint">輸入姓名後會在此顯示會員證。</p>';

  const lifetime = issued ? issued[0].lifetime : $("lifetime").checked;
  if (lifetime) {
    $("expiry-hint").textContent = "永久會員：卡背顯示「永久會員」，不設有效日期。";
  } else {
    const first = issued ? issued[0].expiryDate : $("expiry").value || addYears(todayISO(), 1);
    const prefix = issued || $("expiry").value ? "有效日期：" : "留空即為一年後：";
    $("expiry-hint").textContent = `${prefix}${formatDMY(first)}、${formatDMY(addYears(first, 1))}、${formatDMY(addYears(first, 2))}`;
  }
  const sheets = `共 ${cards.length} 位，需 ${Math.ceil(cards.length / 5)} 張 A4 紙。`;
  const expected =
    !issued && cards.length && nextNumber != null
      ? `預計編號 ${formatNumber(nextNumber)}${cards.length > 1 ? "–" + formatNumber(nextNumber + cards.length - 1) : ""}（如同時有其他人新增，以確認後為準）。`
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
    const nums = issued.map((m) => formatNumber(m.number));
    $("issued-msg").textContent = `已編號 ${nums[0]}${nums.length > 1 ? "–" + nums.at(-1) : ""}，已存入會員名單。`;
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

// ---------- 會員名單 ----------

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
        <td>${formatNumber(m.number)}</td>
        <td>${escapeHtml(m.name)}</td>
        <td>${formatDMY(m.issueDate)}</td>
        <td>${m.lifetime ? "永久會員" : formatDMY(m.expiryDate)}</td>
        <td class="row-actions">
          <button type="button" data-edit="${m.number}">編輯</button>
          <button type="button" class="danger" data-delete="${m.number}">刪除</button>
        </td>
      </tr>`,
    )
    .join("");
  $("empty").hidden = members.length > 0;
  const visibleSelected = members.filter((m) => selected.has(m.number)).length;
  $("select-all").checked = members.length > 0 && visibleSelected === members.length;
  $("reprint-btn").disabled = selected.size === 0;
  $("reprint-btn").textContent = selected.size ? `重印所選（${selected.size}）` : "重印所選";
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
  if (!confirm(`確定永久刪除 ${formatNumber(m.number)} ${m.name}？刪除後無法復原。`)) return;
  try {
    await api.remove(m.number);
    selected.delete(m.number);
    memberCache.delete(m.number);
    showStatus(`已刪除 ${formatNumber(m.number)} ${m.name}。`);
    await loadMembers();
  } catch (err) {
    handleError(err);
  }
});

// ---------- 編輯會員 ----------

let editing = null; // the member being edited, as loaded

function openEdit(m) {
  editing = m;
  $("edit-number").value = formatNumber(m.number);
  $("edit-name").value = m.name;
  $("edit-lifetime").checked = m.lifetime;
  $("edit-expiry").value = m.expiryDate ?? addYears(m.issueDate, 1);
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
    ? "卡背顯示「永久會員」，不設有效日期。"
    : first
      ? `卡背有效日期：${formatDMY(first)}、${formatDMY(addYears(first, 1))}、${formatDMY(addYears(first, 2))}`
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
  if (!Number.isInteger(number) || number < 1 || number > 99999) return showFormError("edit-error", "會員編號必須是 1 至 99999 的數字。");
  const name = $("edit-name").value.trim();
  if (!name) return showFormError("edit-error", "請輸入姓名。");
  const lifetime = $("edit-lifetime").checked;
  const expiryDate = $("edit-expiry").value;
  if (!lifetime && !expiryDate) return showFormError("edit-error", "請選擇首個有效日期，或勾選永久會員。");

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
    showStatus(`已更新 ${formatNumber(updated.number)} ${updated.name}。`);
    await loadMembers();
  } catch (err) {
    if (err.status === 409) {
      const who = err.data?.name ? `「${err.data.name}」` : "其他會員";
      showFormError("edit-error", `會員編號 ${formatNumber(number)} 已被${who}使用，請選擇其他編號。`);
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

// ---------- 設定 ----------

function showFormError(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
}

async function openSettings() {
  showFormError("next-error", "");
  showFormError("pc-error", "");
  $("next-input").value = "";
  try {
    $("next-input").value = formatNumber(await api.nextNumber());
  } catch (err) {
    handleError(err);
  }
}

$("next-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("next-input").value.trim();
  const next = /^\d+$/.test(input) ? Number(input) : NaN;
  if (!Number.isInteger(next) || next < 1 || next > 99999) return showFormError("next-error", "會員編號必須是 1 至 99999 的數字。");
  const btn = e.submitter;
  btn.disabled = true;
  showFormError("next-error", "");
  try {
    await api.setNextNumber(next);
    $("next-input").value = formatNumber(next);
    showStatus(`下一個會員編號已設為 ${formatNumber(next)}。`);
  } catch (err) {
    if (err.status === 409) showFormError("next-error", `必須大於現有最大的會員編號 ${formatNumber(err.data.highest)}。`);
    else handleError(err);
  } finally {
    btn.disabled = false;
  }
});

$("passcode-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const current = $("pc-current").value.trim();
  const next = $("pc-next").value.trim();
  if (next !== $("pc-confirm").value.trim()) return showFormError("pc-error", "兩次輸入的新密碼不一致。");
  if (next.length < 6 || next.length > 64 || !/^[\x20-\x7e]+$/.test(next)) {
    return showFormError("pc-error", "新密碼最少 6 個字元，只可使用英文字母、數字及符號。");
  }
  if (next === current) return showFormError("pc-error", "新密碼與現時密碼相同。");
  const btn = e.submitter;
  btn.disabled = true;
  showFormError("pc-error", "");
  try {
    await api.changePasscode(current, next);
    api.passcode.set(next);
    e.target.reset();
    showStatus("密碼已更改。其他電腦須輸入新密碼。");
  } catch (err) {
    if (err.status === 403) showFormError("pc-error", "現時密碼不正確。");
    else if (err.status === 400) showFormError("pc-error", "新密碼最少 6 個字元，只可使用英文字母、數字及符號。");
    else handleError(err);
  } finally {
    btn.disabled = false;
  }
});

// ---------- start ----------

refreshIssue();
show(api.passcode.get() ? "issue" : "login");
