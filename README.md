# Membership Manager

English · [繁體中文](README.zh-Hant.md)

A small web app for clubs: keep a shared member register, give out member numbers that never collide, and print fold-over membership cards on plain A4 (5 cards per sheet, front and back side by side, cut and fold).

- `site/`: the page. Plain HTML/CSS/JS, no build step, hosted on GitHub Pages.
- `worker/`: a Cloudflare Worker with a D1 database that holds the register and assigns numbers.
- Everything club-specific (name, logo, phone, colours, language, date format) lives in `site/config.json` and `site/assets/`.
- The interface and cards come in English (`en`) and Traditional Chinese (`zh-Hant`); more languages are one JSON file each.

Both services fit in their free tiers for a club-sized register.

In use at 澳門中國民族服飾愛好者協會 (Macau): https://furic.github.io/membership-manager/

## Using it

1. Open the page and enter the shared passcode. Each computer only asks once.
2. **New members**: type one name per line. Leave **Valid until** empty for one year from today (`validityYears` in the config), or tick **Lifetime member**. The expiry date is printed large on the back of the card.
3. Check the preview, then press **Confirm and number**. Numbers are given out in order (001, 002, …) and the members are saved to the register. The preview shows the expected numbers; they are final only once confirmed, in case someone else adds members at the same time. To start from a given number (say 100), change **Next member number** in **Settings**. It must be higher than the highest existing number.
4. Press **Print**. Choose **A4**, **actual size (100%)**, and turn **headers and footers off**. Each A4 sheet holds 5 cards.
5. Cut along the solid lines and fold along the dashed middle line: the front is on the left, the back on the right.
6. **Members**: search by name or number. **Edit** changes a member's number (it warns when the number is taken), name, expiry date or lifetime status. **Delete** removes a member for good. Tick members and press **Reprint selected** to print their cards again.
7. **Settings**: change the next member number, or the shared passcode (enter the current one; the new one needs at least 6 characters, English letters, digits and symbols only). After a passcode change, other computers must enter the new one.

## Set it up for your own club

You need a GitHub account and a free Cloudflare account. It takes about 20 minutes.

1. **Fork** this repository.
2. **Create the API** (Cloudflare Worker + D1 database):

   ```sh
   cd worker
   npm install
   npx wrangler login
   npx wrangler d1 create membership          # copy the database_id it prints into wrangler.toml
   ```

   In `worker/wrangler.toml`, set `database_id`, and set `ALLOWED_ORIGINS` to where your page will live: `https://<your-github-user>.github.io` (scheme and host only, no path). Then:

   ```sh
   npx wrangler d1 migrations apply membership --remote
   npx wrangler secret put PASSCODE           # the first shared passcode; it can be changed later on the Settings page
   npx wrangler deploy                        # prints the Worker URL
   ```

3. **Configure the page**: edit `site/config.json` (fields below). Set `apiBase` to the Worker URL from the last step. Put your logo, stamp and favicon in `site/assets/` and point `logo`, `stamp` and `favicon` at them.
4. **Publish**: in your fork, go to Settings → Pages, set Source to **GitHub Actions**, and push to `main`. The workflow runs the tests and deploys `site/`.

Try a configuration locally before you push. See [Run locally](#run-locally). `?lang=en` on the page URL previews another language.

### Keep the settings out of `config.json` (optional)

If you'd rather leave `site/config.json` as it is, so pulling updates from this repository never conflicts, store your whole config as a repository variable instead. Go to Settings → Secrets and variables → Actions → Variables, add `SITE_CONFIG`, and paste the JSON. The deploy writes it over `site/config.json` before publishing. Nothing in the config is secret: the page is public, and the passcode is a Worker secret.

### Configuration

`site/config.json`. Only `apiBase` and `clubName` are required; any field left out uses the default.

| Field | Default | What it does |
|---|---|---|
| `apiBase` | | URL of your Worker, e.g. `https://membership-api.<account>.workers.dev` |
| `locale` | `"en"` | Interface and card language: a file in `site/locales/` (`"en"`, `"zh-Hant"`). `"zh-Hant-MO"` falls back to `zh-Hant.json`. |
| `clubName` | | Club name in the page header |
| `cardClubName` | `[clubName]` | Club name on the card, one string per line, e.g. `["Riverside Folk", "Costume Society"]` |
| `phone` | `""` | Printed at the bottom of every card's back; empty leaves it off |
| `logo` | `"assets/logo.png"` | Header and card-front logo (square) |
| `stamp` | `"assets/stamp.png"` | Faint watermark on the card back; `""` leaves it off |
| `favicon` | `"assets/favicon.png"` | Browser-tab icon |
| `cardColor` | `"#a3302f"` | Accent colour on the cards: club name, seal, brush line, expiry label |
| `appColor` | `"#543c7d"` | Accent colour of the page: buttons, tabs, header |
| `numberDigits` | `3` | Member numbers are zero-padded to this many digits (`001`) |
| `validityYears` | `1` | Default validity when the expiry date is left empty |
| `dateFormat` | `"DD/MM/YYYY"` | Dates on cards and in the register. Tokens: `DD`, `D`, `MM`, `M`, `YYYY`, e.g. `"MM/DD/YYYY"`, `"YYYY-MM-DD"` |

Fonts are loaded in `site/index.html` (LXGW WenKai TC for cards, Noto Sans TC for the page). Both include Latin letters, so English works as is.

### Add a language

Copy `site/locales/en.json` to `site/locales/<code>.json` (e.g. `fr.json`), translate the values, and set `"locale": "<code>"`. Keys you leave out show the English text. Keep `{{placeholders}}` as they are. A key ending in `_one` is the singular form, used when the count is 1. `_cardStyle` picks the card layout: `"cjk"` gives the vertical seal and labels justified to one width, `"latin"` gives a horizontal seal and names that shrink to fit.

## Technical notes

- Every batch takes its numbers inside one D1 transaction, so two people issuing at the same moment never get the same number.
- Design and plan, written for the first club: `docs/superpowers/`.

### Tests

```sh
cd site && npm test                     # dates, names, languages, card rendering
cd worker && npm install && npm test    # API, incl. concurrent number assignment and CORS
```

### Run locally

```sh
cd worker && npx wrangler d1 migrations apply membership --local && npx wrangler dev   # needs worker/.dev.vars with PASSCODE=...
cd site && python3 -m http.server 8080
# open http://localhost:8080/?api=http://127.0.0.1:8787
```

`?api=` only works on `localhost`, so a crafted link can't send the passcode elsewhere. The Worker always accepts `localhost` origins.

### Move to another Cloudflare account

Follow step 2 of the setup above in the new account, update `apiBase` in `site/config.json`, and push. If the page's address changes, update `ALLOWED_ORIGINS` in `worker/wrangler.toml` and run `npx wrangler deploy` again.

### Passcode

The passcode starts as the `PASSCODE` secret. Once someone changes it on the Settings page, a salted SHA-256 hash is stored in the `settings` table (key `passcode`) and the secret stops working. If the passcode is forgotten, delete that row to fall back to the secret:

```sh
cd worker && npx wrangler d1 execute membership --remote --command "DELETE FROM settings WHERE key = 'passcode'"
```

### Backup

```sh
cd worker && npx wrangler d1 export membership --remote --output members-backup.sql
```

## License

[MIT](LICENSE)
