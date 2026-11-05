# 會員證 Generator: Design

Date: 2026-11-04

## Why

澳門中國民族服飾愛好者協會 is a brand-new club. It needs paper membership cards with a front and a back, printed on one side of plain A4 and folded. The only template is an old Word file from another club (`references/membership-sheet.docx`, 澳門榮舜文娛體育會), where each card was filled in by hand and the number was typed in manually.

A few people will issue cards, from different computers. They need:

- one place to type in names and get print-ready cards
- member numbers that never collide, even when two people issue cards on the same day
- a record of who got which number, so cards can be looked up and reprinted

## Goals

1. Paste a list of Chinese names, optionally pick an expiry date, and get A4 pages of fold-over cards ready to print on an ordinary single-sided printer.
2. Give out 會員編號 automatically from one shared counter, starting at 001.
3. Keep a shared member register (會員名單) that can be searched and reprinted from.
4. Host it for free with very little upkeep: the page on GitHub Pages, plus one small storage service.

## Non-goals

- Personal logins or per-user accounts. One shared passcode is enough.
- Tracking renewals. Renewals are signed by hand on the back of the card.
- Member photos, QR codes, payments, or an English interface.
- Producing Word or PDF files. The browser's print dialog is the output; users may "Save as PDF" from it if they want.

## Anti-goals (a failure even if it "works")

- Two members end up with the same number.
- A card's front and back don't line up when folded, or a fold puts the back upside down.
- The interface or the cards use Simplified Chinese.
- Using it requires a GitHub account or token.

## The card (decided with the user; mockups: `card-mockup.html` and the full A4 sheet `sheet-mockup.html`, next to this file)

Size, when folded: 85.6 × 54 mm (bank-card size). Each half has a rounded dark border and a white background.

**Front (正面)**, layout "A":

- Top left: the club stamp as the logo. Use `site/assets/stamp.png`, which has already been prepared from `references/06f2ed783d15f6de3ac0df25b9ab1115.jpg`: trimmed to the seal's edge with a 4px margin, with a transparent background and ink colour `#543c7d`. It is about 24 mm wide on the card.
- To the right of the stamp, vertically centred with it, in a muted brick red `#a3302f` (changed from the stamp purple on 2026-11-05), bold, on two lines broken as the stamp is:
  `澳門中國民族服飾` / `愛好者協會`
- `會員證`: large, bold, centred.
- Four rows, with labels justified to the same width:
  - `姓名：<name>`
  - `會員編號：<number>`
  - `簽發日期：<issue date>`
  - `簽名：________` (on its own line, blank for the member to sign)

**Back (背面)**: three periods. Each period is two lines:

- `有效日期：<date>`
- `簽名：________` (on its own line)

Dates:

- **Format.** All dates are `dd/mm/yyyy`, for example `03/11/2027`.
- **簽發日期.** This is the date the cards are issued, i.e. the day the numbers are assigned. It uses the browser's local date; the users are in Macau.
- **First 有效日期.** The date the user enters. It is optional. If it is left empty, it is the issue date plus one year.
- **Second and third 有效日期.** These are the first date plus one year and plus two years. Example: 03/11/2027, 03/11/2028, 03/11/2029.
- **29/02.** Plus one year becomes 28/02. (My call.)

**永久會員 (lifetime members)**, added 2026-11-04: an option per batch, off by default. When it is on, there is no expiry date. The back of the card shows only 「永久會員」, large and centred in the club purple, and the register shows 永久會員 in the 有效日期 column. Stored as `lifetime = 1` with `expiry_date = NULL` (migration `0002_lifetime.sql`).

**Later additions (2026-11-04):**
- The issue preview shows the expected numbers (`GET /api/members/next` = highest number + 1). They are final only after 確認並編號.
- 會員名單 has 修改編號. Saving a number that is already used is refused with a warning naming the holder (API `409 {error:"duplicate", number, name}`). New members still get highest + 1.
- (2026-11-05) 修改姓名 and 修改編號 were merged into one 編輯 dialog, which also edits the first 有效日期 or switches 永久會員 on/off (`PATCH` takes `name`, `number`, `expiryDate`, `lifetime`; `lifetime: true` clears the date, `lifetime: false` needs a date).
- 作廢 was replaced by 刪除: permanent deletion (`DELETE /api/members/:number`). A deleted member's number is free again. Existing voided rows were removed by migration `0003_delete_voided.sql`.
- 新增會員 shows 「下一個會員編號」 with a 設定 button. The chosen number is stored as `settings.next_number` (`PUT /api/members/next`). The next number is max(highest + 1, setting). A value at or below the highest existing number is refused (`409 {error:"too_low", highest}`).

Number: zero-padded to 3 digits (`001`). Past 999 it simply grows (`1000`). (My call.)

Language: everything is Traditional Chinese, with `lang="zh-Hant-MO"`. Use a Traditional Chinese web font such as Noto Sans TC, so cards look the same on every computer. (Font choice is my call.)

## Printing (fold-over, single-sided)

The issuers' printers print one side only, so each card is printed with front and back side by side, then cut out and folded in half. This is the same arrangement as the old Word sheet, which had fronts in the left column and backs in the right.

- **The sheet.** A4 portrait, plain paper, single-sided.
- **The card strip.** Each card prints as one strip of 171.2 × 54 mm: the front (85.6 × 54) on the left and the back (85.6 × 54) on the right. They share their middle edge, which is the fold line.
- **The fold.** Folding along that vertical line puts the back behind the front, and the back reads upright when the card is turned over left to right. Neither half is rotated or mirrored.
- **Layout.** 5 strips per A4 sheet, stacked vertically (5 × 54 = 270 mm), centred on the page. A batch of more than 5 members runs over several pages, and a last page with fewer strips leaves the rest blank.
- **Lines.**
  - Solid cut line: the outline of the strip.
  - Dashed fold line: the middle edge.
  - Front and back each keep the rounded-border look from the mockup inside their half.
  - Small gaps between strips, or shared cut lines, are the builder's call. Cutting must stay easy with scissors or a paper trimmer.
- **Print settings.**
  - The page's own controls (form, buttons) are hidden when printing.
  - Use `@page { size: A4; margin: … }` so the browser doesn't scale.
  - The UI should tell users to print at 100% scale ("實際大小") with headers and footers off.

## The page and its flow

One static site, Traditional Chinese throughout. It has three views.

**1. Passcode (輸入密碼).** On first visit the user enters the shared passcode. The page remembers it on that computer, in browser storage, until they log out. A wrong passcode shows an error.

**2. Issue cards (新增會員).**

1. A large text box for names, one per line. Blank lines and surrounding spaces are ignored.
2. An optional expiry-date field, empty by default, with a hint: "留空即為一年後".
3. A preview of the cards. It shows "待定" in place of the numbers, so users can check names before committing.
4. A button, `確認並編號`. This saves the members to the register and assigns the next numbers in the order the names were typed. The preview then shows the real numbers and a `列印` button.
5. Once numbers are assigned, they are final. Editing the names in the box afterwards does not re-number anything; the user would start a new batch.

**3. Member register (會員名單).**

- A table with 會員編號, 姓名, 簽發日期 and 有效日期 (the first date), newest first.
- A search box that matches by name or number.
- Tick one or more rows, then `重印` prints their cards with exactly the stored data. Nothing new is assigned.
- A typo in a name can be fixed with an edit in the register; the number stays the same. (My call.)
- Numbers are never reused. If a card was a mistake, it stays in the register, and an optional 「作廢」 (void) flag hides it from default view. (My call.)

## Storage and hosting (my call, the user agreed to the general approach)

- **Page:** plain static files (HTML/CSS/JS) in a GitHub repo, served by GitHub Pages. A build step is optional and the builder's call. Simpler is preferred.
- **Data:** a small Cloudflare Worker with a D1 (SQLite) database, on Cloudflare's free tier.
  - Table `members`: `number` (integer, unique), `name`, `issue_date`, `expiry_date` (the first 有效日期), `voided` (bool), `created_at`.
  - Assigning numbers must be atomic. A batch of N names takes the next N numbers in one transaction, so two people issuing at the same time can never get the same number. With "max(number)+1" or a counter row, this happens inside a single D1 batch or transaction.
  - API (shape is the builder's call): issue a batch, list or search members, edit a name, void a member.
- **Access:** every API call carries the shared passcode, which the Worker checks against a Worker secret. CORS allows only the GitHub Pages origin, plus localhost for development.
- **Setup and deploy: the builder does this for the user.**
  - GitHub: a public repo under the user's account `furic`. The name `membership-creator` is my call. GitHub Pages serves from it. The seal image being public is accepted by the user.
  - Cloudflare: the Worker and the D1 database go on the user's Cloudflare account, using the `wrangler` login on this machine. Check with `wrangler whoami` before deploying.
  - The passcode is picked by the builder and told to the user at handover. It is stored only as a Worker secret, never in the repo.
  - The README still documents the steps (create D1, set the secret, deploy the Worker, set the Worker URL in the site's config) so the user can redo or move it later.
  - Verify the result live after deploying: log in, issue a test batch, print-preview, check the register, then delete the test rows.

## Left to the builder

- Code structure, framework or none, and the exact API routes.
- Visual styling of the input and register screens, which should be plain, clear and friendly for non-technical users.
- Cut guides, and exact spacing inside the card, within the mockup's layout.
- Tests: at minimum, the date logic (default expiry, +1/+2 years, 29/02) and the number assignment (no gaps, no duplicates across two concurrent batches).
