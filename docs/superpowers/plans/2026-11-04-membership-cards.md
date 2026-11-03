# 會員證 Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Traditional-Chinese static page that turns a list of names into printable fold-over membership cards, with numbers and a member register kept in a shared online store.

**Architecture:** Plain HTML/CSS/ES-module JS in `site/`, deployed to GitHub Pages by a GitHub Actions workflow. A Cloudflare Worker in `worker/` with one D1 table holds members; it assigns numbers atomically inside one D1 batch. The page and the Worker talk over JSON with a shared passcode in the `Authorization` header.

**Tech Stack:** vanilla JS (no build), Node `node:test` for the page's pure modules, Cloudflare Workers + D1, `wrangler` 4, `vitest` + `@cloudflare/vitest-pool-workers` for Worker tests.

**Spec:** `docs/superpowers/specs/2026-11-04-membership-cards-design.md` (mockups: `card-mockup.html`, `sheet-mockup.html`)

## Global Constraints

- Every user-facing string is Traditional Chinese; `<html lang="zh-Hant-MO">`.
- Dates are shown as `dd/mm/yyyy`; they are stored and sent as ISO `YYYY-MM-DD`.
- 簽發日期 = the browser's local date when 確認並編號 is pressed.
- First 有效日期 = entered date, or issue date + 1 year if empty; second and third = first + 1 and + 2 years; 29/02 + n years → 28/02 when the target year is not leap.
- 會員編號 = `String(n).padStart(3, "0")`, starting at 1, never reused.
- Card halves 85.6 × 54 mm; one strip = front|back = 171.2 × 54 mm; 5 strips per A4 portrait page; solid cut outline, dashed fold line in the middle.
- Club name `澳門中國民族服飾` / `愛好者協會` in `#543c7d`; stamp `site/assets/stamp.png`.
- Font: Noto Sans TC (Google Fonts).
- The passcode lives only in the Worker secret `PASSCODE`; never committed.
- CORS allow-list: `https://furic.github.io` and `http://localhost:*` / `http://127.0.0.1:*`.

## Review Focus

- Double-clicking 確認並編號, or retrying after a slow response → must not issue the batch twice (button disabled while in flight; Task 4 test).
- Two people issuing at the same moment → no duplicate or skipped numbers (Task 2 concurrency test).
- Names pasted with full-width spaces (U+3000), blank lines, or Windows `\r\n` → trimmed and ignored (Task 1 test on `parseNames`).
- A long name (e.g. 8+ characters) → still fits on one line of the card (CSS shrink; checked in Task 3 visual verification with a 10-character name).
- Passcode changed or wrong in browser storage → any 401 sends the user back to the passcode screen instead of a silent failure (Task 4).

---

### Task 1: Pure helpers (dates, names, numbers, pagination)

**Files:**
- Create: `site/js/lib.js`, `site/package.json` (`{"type":"module","scripts":{"test":"node --test"}}`), `site/test/lib.test.js`

**Interfaces — Produces (all named exports of `site/js/lib.js`):**
- `todayISO(): string` — local date `YYYY-MM-DD`
- `addYears(iso: string, n: number): string`
- `formatDMY(iso: string): string` — `"03/11/2027"`
- `expiryDates(issueISO: string, firstISO: string | ""): [string, string, string]`
- `parseNames(text: string): string[]`
- `formatNumber(n: number): string`
- `chunk<T>(items: T[], size: number): T[][]`

- [ ] **Step 1: Write failing tests** in `site/test/lib.test.js`:
  - `addYears("2027-11-03", 1) === "2028-11-03"`; `addYears("2028-02-29", 1) === "2029-02-28"`; `addYears("2028-02-29", 4) === "2032-02-29"`
  - `formatDMY("2027-11-03") === "03/11/2027"`
  - `expiryDates("2026-11-04", "")` deep-equals `["2027-11-04","2028-11-04","2029-11-04"]`; `expiryDates("2026-11-04","2027-11-03")` → `["2027-11-03","2028-11-03","2029-11-03"]`
  - `parseNames(" 陳大文 \r\n\n　李小梅　\n") ` deep-equals `["陳大文","李小梅"]`
  - `formatNumber(1) === "001"`, `formatNumber(42) === "042"`, `formatNumber(1000) === "1000"`
  - `chunk([1,2,3,4,5,6,7], 5)` → `[[1,2,3,4,5],[6,7]]`; `chunk([], 5)` → `[]`
- [ ] **Step 2:** `cd site && npm test` → FAIL (module missing)
- [ ] **Step 3:** Implement `site/js/lib.js`. Date math on `{y,m,d}` integers parsed from the ISO string (no `Date` timezone shifts); clamp day to the target month's length.
- [ ] **Step 4:** `cd site && npm test` → all pass
- [ ] **Step 5:** Commit `feat: date, name and number helpers`

### Task 2: Worker + D1 (members API)

**Files:**
- Create: `worker/wrangler.toml` (name `membership-api`, D1 binding `DB`, database `membership`, `migrations_dir = "migrations"`), `worker/migrations/0001_members.sql`, `worker/src/index.js`, `worker/package.json`, `worker/vitest.config.js`, `worker/test/api.test.js`, `worker/.dev.vars` (gitignored, `PASSCODE=test-pass`)

**Schema:**
```sql
CREATE TABLE members (
  number INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Interfaces — Produces (HTTP, JSON, every route needs `Authorization: Bearer <PASSCODE>` else `401 {"error":"unauthorized"}`):**
- `GET /api/ping` → `200 {"ok":true}`
- `POST /api/members` body `{names: string[], issueDate: string, expiryDate: string}` → `201 {members: Member[]}` in input order. `400 {"error": "..."}` if names empty, > 100, any name empty/over 30 chars, or dates not `YYYY-MM-DD`.
- `GET /api/members?q=<text>&voided=1` → `200 {members: Member[]}` newest number first; `q` matches name substring or exact number; voided rows excluded unless `voided=1`.
- `PATCH /api/members/:number` body `{name?: string, voided?: boolean}` → `200 {member: Member}`; `404` if missing.
- `OPTIONS *` → CORS preflight. CORS headers echo the origin only if allow-listed.
- `Member = {number: number, name: string, issueDate: string, expiryDate: string, voided: boolean}`

Number assignment: one `env.DB.batch([...])` of `INSERT INTO members (number, name, issue_date, expiry_date) SELECT COALESCE(MAX(number), 0) + 1, ?, ?, ? FROM members RETURNING *` per name — D1 runs a batch as one transaction, so batches serialize.

- [ ] **Step 1: Write failing tests** (`worker/test/api.test.js`, using `SELF.fetch` from `cloudflare:test`, migrations applied in setup):
  - no/wrong passcode → 401
  - POST 3 names → numbers 1,2,3 in order, dates echoed
  - two concurrent POSTs of 5 names each (`Promise.all`) → 10 distinct numbers, exactly 1..10
  - GET `?q=李` finds by name; `?q=2` finds number 2; voided excluded by default
  - PATCH name keeps the number; PATCH `voided:true` hides it from default list
  - POST with `names: []` → 400; bad date → 400
  - preflight from `https://furic.github.io` gets `Access-Control-Allow-Origin` echoed; from `https://evil.example` does not
- [ ] **Step 2:** `cd worker && npm test` → FAIL
- [ ] **Step 3:** Implement `worker/src/index.js`
- [ ] **Step 4:** `cd worker && npm test` → all pass
- [ ] **Step 5:** Commit `feat: members API worker on D1`

### Task 3: Card and sheet rendering + print CSS

**Files:**
- Create: `site/js/cards.js`, `site/css/cards.css`, `site/assets/stamp.png` (moved from `assets/stamp.png`), `site/test/cards.test.js`

**Interfaces:**
- Consumes: `formatDMY`, `expiryDates`, `formatNumber`, `chunk` from Task 1.
- Produces: `renderSheets(cards: CardData[]): string` (HTML of `.sheet` pages, 5 `.strip`s each), where `CardData = {name: string, number: number | null, issueDate: string, expiryDate: string}`; `number: null` renders `待定`.

- [ ] **Step 1: Failing tests** in `site/test/cards.test.js`: 7 cards → 2 `class="sheet"` and 7 `class="strip"`; a card with number 5 contains `005`, null contains `待定`; expiry `2027-11-03` renders `03/11/2027`, `03/11/2028`, `03/11/2029`; names are HTML-escaped (`<b>` → `&lt;b&gt;`).
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** Implement `renderSheets`, plus `cards.css` matching `sheet-mockup.html` in mm units. `@page { size: A4; margin: 0 }`; `.sheet` 210 × 297 mm with strips centred, `break-after: page`; `.name` uses `white-space: nowrap` and shrinks by length (`data-len` ≥ 6 → smaller font).
- [ ] **Step 4:** `npm test` → pass
- [ ] **Step 5:** Visual check: a scratch page rendering 7 cards (one 10-char name) screenshotted in headless Chrome and printed to PDF (`--print-to-pdf`); confirm 2 A4 pages, strip size 171.2 × 54 mm, nothing overflows.
- [ ] **Step 6:** Commit `feat: fold-over card sheets and print styles`

### Task 4: App shell (passcode, 新增會員, 會員名單)

**Files:**
- Create: `site/index.html`, `site/css/app.css`, `site/js/config.js` (`export const API_BASE = "https://membership-api.<account>.workers.dev"`), `site/js/api.js`, `site/js/app.js`

**Interfaces:**
- Consumes: Task 1 helpers, `renderSheets` (Task 3), HTTP API (Task 2).
- Produces: `api.js` exports `ping()`, `issue(names, issueDate, expiryDate)`, `list(q, includeVoided)`, `update(number, patch)`; each throws `AuthError` on 401 and `Error(message)` otherwise. Passcode stored in `localStorage["membership.passcode"]` (wrapped in try/catch).

Views (tabs at top, hidden in print):
- 輸入密碼: one field + 登入; calls `ping()`; error text 「密碼錯誤」.
- 新增會員: textarea 「會員姓名（每行一位）」, date input 「首個有效日期（留空即為一年後）」, live preview via `renderSheets` with `number: null`, button 確認並編號 (disabled while empty or in flight), then 列印 (`window.print()`) and 新一批. Hint near 列印: 「列印時請選 A4、實際大小（100%），並關閉頁首及頁尾。」
- 會員名單: search box, table (選取 / 會員編號 / 姓名 / 簽發日期 / 有效日期 / 操作: 修改姓名, 作廢/恢復), 顯示已作廢 toggle, 重印所選 → prints the selected stored cards.
- Any `AuthError` → clear the stored passcode and show 輸入密碼.

- [ ] **Step 1:** Implement the files.
- [ ] **Step 2:** Run locally: `cd worker && npx wrangler dev` (local D1) and `cd site && python3 -m http.server 8080` with `API_BASE` pointing at the local worker via `?api=` override in `config.js` for development. Drive it in a headless browser: wrong passcode → 「密碼錯誤」; issue 3 names → numbers 001–003; double-click the button → still 3 rows; register search, rename, void; print preview PDF has the right pages.
- [ ] **Step 3:** Commit `feat: issue and register screens`

### Task 5: Deploy and docs

**Files:**
- Create: `.github/workflows/pages.yml` (upload `site/` as the Pages artifact on push to `main`), `README.md` (zh-Hant usage + English setup: D1 create, migrations, secret, deploy, config), `.gitignore` (`node_modules`, `.dev.vars`, `.wrangler`, `.superpowers`)

- [ ] **Step 1:** `git init -b main`, commit, `gh repo create furic/membership-creator --public --source . --push`; enable Pages with source "GitHub Actions" (`gh api -X POST repos/furic/membership-creator/pages -f build_type=workflow`).
- [ ] **Step 2:** `wrangler d1 create membership`, put the id in `wrangler.toml`, `wrangler d1 migrations apply membership --remote`, `wrangler secret put PASSCODE` (a generated passcode), `wrangler deploy`; set `API_BASE` to the deployed URL, push.
- [ ] **Step 3:** Live check at `https://furic.github.io/membership-creator/`: log in, issue a 2-name test batch, check print preview and register, then `wrangler d1 execute membership --remote --command "DELETE FROM members"` and confirm the register is empty.
- [ ] **Step 4:** Commit and push any fixes.
