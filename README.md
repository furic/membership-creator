# 會員管理 — 澳門中國民族服飾愛好者協會

網址：https://furic.github.io/membership-creator/

## 使用方法

1. 打開網址，輸入協會共用密碼（同一部電腦只需輸入一次）。
2. **新增會員**：每行輸入一位會員姓名。「有效日期」可留空，留空即為今日起計一年後；有效日期以大字印在卡背。
3. 檢查預覽無誤後，按 **確認並編號**。系統會按次序派發會員編號（001、002……），並存入會員名單。預覽會顯示預計編號，按下後才正式確定。如需由指定編號開始（例如 100），可到 **設定** 更改「下一個會員編號」（必須大於現有最大編號）。
4. 按 **列印**。列印設定請選 **A4**、**實際大小（100%）**，並**關閉頁首及頁尾**。每張 A4 可印 5 張會員證。
5. 沿實線剪下，沿中間虛線對摺：左邊是正面，右邊是背面。
6. **會員名單**：可搜尋姓名或編號；按 **編輯** 可修改會員編號（如編號已被使用會提示）、姓名、有效日期或改為永久會員；亦可永久刪除會員，亦可勾選會員後按 **重印所選**。
7. **設定**：更改下一個會員編號；更改協會共用密碼（需輸入現時密碼，新密碼最少 6 個字元，只可使用英文字母、數字及符號）。更改密碼後，其他電腦須輸入新密碼。

---

## Technical setup (English)

- `site/`: static page (plain HTML/CSS/JS, no build). Deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.
- `worker/`: Cloudflare Worker `membership-api` with a D1 database `membership`. It holds the member register and assigns numbers atomically.
- Design and plan: `docs/superpowers/`.

### Tests

```sh
cd site && npm test                     # date / name / card rendering helpers
cd worker && npm install && npm test    # API, incl. concurrent number assignment
```

### Run locally

```sh
cd worker && npx wrangler d1 migrations apply membership --local && npx wrangler dev   # needs worker/.dev.vars with PASSCODE=...
cd site && python3 -m http.server 8080
# open http://localhost:8080/?api=http://127.0.0.1:8787
```

### Deploy / move to another Cloudflare account

```sh
cd worker
npx wrangler login
npx wrangler d1 create membership                 # put the new database_id in wrangler.toml
npx wrangler d1 migrations apply membership --remote
npx wrangler secret put PASSCODE                  # the initial shared passcode
npx wrangler deploy
```

Then set `DEFAULT_API_BASE` in `site/js/config.js` to the deployed Worker URL, and push. If the site's address changes, update `ALLOWED_ORIGINS` in `worker/src/index.js` and redeploy the Worker.

### Passcode

The passcode starts as the `PASSCODE` secret. Once someone changes it on the 設定 page, a salted SHA-256 hash is stored in the `settings` table (key `passcode`) and the secret stops working. If the passcode is forgotten, delete that row to fall back to the secret:

```sh
cd worker && npx wrangler d1 execute membership --remote --command "DELETE FROM settings WHERE key = 'passcode'"
```

### Backup

```sh
cd worker && npx wrangler d1 export membership --remote --output members-backup.sql
```
