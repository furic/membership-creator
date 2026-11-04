// Screens: 輸入密碼 → 新增會員 / 會員名單. Cards are printed from #print-root.
import * as api from "./api.js";
import { renderSheets } from "./cards.js";
import { addYears, formatDMY, formatNumber, parseNames, todayISO } from "./lib.js";

const $ = (id) => document.getElementById(id);
const views = ["login", "issue", "register"];

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

$("logout").addEventListener("click", () => {
  api.passcode.clear();
  show("login");
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

$("set-next-btn").addEventListener("click", async () => {
  const input = prompt("設定下一個新會員的編號：", nextNumber == null ? "" : formatNumber(nextNumber))?.trim();
  if (!input) return;
  const next = /^\d+$/.test(input) ? Number(input) : NaN;
  if (!Number.isInteger(next) || next < 1 || next > 99999) {
    alert("會員編號必須是 1 至 99999 的數字。");
    return;
  }
  try {
    await api.setNextNumber(next);
    showStatus(`下一個會員編號已設為 ${formatNumber(next)}。`);
  } catch (err) {
    if (err.status !== 409) return handleError(err);
    alert(`下一個編號必須大於現有最大的會員編號 ${formatNumber(err.data.highest)}。`);
  }
  await refreshNextNumber();
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
          <button type="button" data-rename="${m.number}">修改姓名</button>
          <button type="button" data-renumber="${m.number}">修改編號</button>
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
  const renameNo = Number(e.target.dataset.rename);
  const renumberNo = Number(e.target.dataset.renumber);
  const deleteNo = Number(e.target.dataset.delete);
  const m = members.find((x) => x.number === (renameNo || renumberNo || deleteNo));
  if (!m) return;
  try {
    if (renumberNo) {
      const input = prompt(`修改「${m.name}」的會員編號：`, formatNumber(m.number))?.trim();
      if (!input) return;
      const number = /^\d+$/.test(input) ? Number(input) : NaN;
      if (!Number.isInteger(number) || number < 1 || number > 99999) {
        alert("會員編號必須是 1 至 99999 的數字。");
        return;
      }
      if (number === m.number) return;
      try {
        await api.update(m.number, { number });
      } catch (err) {
        if (err.status !== 409) throw err;
        const who = err.data?.name ? `「${err.data.name}」` : "其他會員";
        alert(`會員編號 ${formatNumber(number)} 已被${who}使用，未有修改。請選擇其他編號。`);
        return;
      }
      if (selected.delete(m.number)) selected.add(number);
      memberCache.delete(m.number);
      showStatus(`「${m.name}」的會員編號已由 ${formatNumber(m.number)} 改為 ${formatNumber(number)}。`);
    } else if (renameNo) {
      const name = prompt(`修改 ${formatNumber(m.number)} 的姓名：`, m.name)?.trim();
      if (!name || name === m.name) return;
      await api.update(m.number, { name });
      showStatus(`已更新 ${formatNumber(m.number)} 的姓名。`);
    } else {
      if (!confirm(`確定永久刪除 ${formatNumber(m.number)} ${m.name}？刪除後無法復原。`)) return;
      await api.remove(m.number);
      selected.delete(m.number);
      memberCache.delete(m.number);
      showStatus(`已刪除 ${formatNumber(m.number)} ${m.name}。`);
    }
    await loadMembers();
  } catch (err) {
    handleError(err);
  }
});

$("reprint-btn").addEventListener("click", () => {
  for (const m of members) if (selected.has(m.number)) memberCache.set(m.number, m);
  const cards = [...selected].sort((a, b) => a - b).map((n) => memberCache.get(n)).filter(Boolean);
  printCards(cards);
});

// ---------- start ----------

refreshIssue();
show(api.passcode.get() ? "issue" : "login");
