# CLAUDE.md

Membership register + printable fold-over cards for clubs. See README.md for setup and the config reference.

## Layout

- `site/`: static page, **no build step and no dependencies**. ES modules loaded straight by the browser; keep it that way (no bundler, no npm packages in `site/`).
  - `js/app.js` boots in order: `loadConfig()` (config.json) → `loadMessages()` (locales) → `translatePage()` → screens.
  - `js/config.js` holds `DEFAULTS` and the `fmtNumber` / `fmtDate` / `defaultExpiry` helpers. `js/lib.js` stays pure (no config, no DOM) so it is unit-testable.
  - `js/cards.js` renders the A4 sheets; styling in `css/cards.css` (real mm sizes, A4 print).
- `worker/`: Cloudflare Worker + D1. Schema changes go in a new file in `worker/migrations/`; never edit an applied one.
- `site/config.json` is the live config of the club this repo serves (澳門中國民族服飾愛好者協會). Do not replace it with sample values.

## Rules

- **No user-facing text in code.** Every string goes through `t("key")` in JS or a `data-i18n` / `data-i18n-placeholder` / `data-i18n-label` attribute in `index.html`, and is added to **both** `site/locales/en.json` and `site/locales/zh-Hant.json`. A test fails when the two files' keys differ (`_one` singular forms are exempt).
- New club-specific values belong in `config.js` `DEFAULTS` + the README config table (both READMEs), not hard-coded.
- The CJK card layout (`_cardStyle: "cjk"`) is in use and tuned for print. Card changes must leave the Chinese cards rendering the same unless the change is meant for them; put Latin-only tweaks under `[data-card-style="latin"]`.
- Escape anything interpolated into HTML with `escapeHtml` (names, config values, locale strings).
- `README.md` (English) and `README.zh-Hant.md` (Traditional Chinese) mirror each other; update both.

## Commands

```sh
cd site && npm test       # node --test
cd worker && npm test     # vitest with the Workers pool
```

Run locally: `wrangler dev` in `worker/` (needs `worker/.dev.vars` with `PASSCODE=...`), `python3 -m http.server 8080` in `site/`, open `http://localhost:8080/?api=http://127.0.0.1:8787`. Add `&lang=en` to preview English.

Pushing to `main` deploys `site/` to GitHub Pages. The Worker is deployed by hand with `npx wrangler deploy`.
