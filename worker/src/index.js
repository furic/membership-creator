// Members API for the 會員證 generator. Holds the shared member register in D1 and
// hands out 會員編號 — every batch takes its numbers inside one D1 transaction.

const ALLOWED_ORIGINS = [/^https:\/\/furic\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH = 100;
const MAX_NAME = 30;
const MAX_NUMBER = 99999;

// Next number = highest existing + 1, but never below the `next_number` setting.
const NEXT_NUMBER_SQL = `MAX(
  (SELECT COALESCE(MAX(number), 0) + 1 FROM members),
  COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'next_number'), 1)
)`;

class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const toMember = (row) => ({
  number: row.number,
  name: row.name,
  issueDate: row.issue_date,
  expiryDate: row.expiry_date,
  lifetime: Boolean(row.lifetime),
});

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.some((re) => re.test(origin))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const enc = new TextEncoder();

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hashPasscode(salt, code) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(`${salt}:${code}`)));
}

// The passcode set from the 設定 page (stored as "salt:sha256") replaces the PASSCODE secret.
// Deleting the `passcode` setting row falls back to the secret again.
async function passcodeMatches(env, code) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'passcode'").first();
  if (row) {
    const [salt, stored] = row.value.split(":");
    return sameBytes(enc.encode(await hashPasscode(salt, code)), enc.encode(stored));
  }
  return Boolean(env.PASSCODE) && sameBytes(enc.encode(code), enc.encode(env.PASSCODE));
}

async function authorized(request, env) {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return passcodeMatches(env, header.slice("Bearer ".length));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

function cleanName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > MAX_NAME) throw new HttpError(400, "invalid name");
  return trimmed;
}

async function issueMembers(env, body) {
  const { names, issueDate, expiryDate, lifetime = false } = body ?? {};
  if (!Array.isArray(names) || names.length === 0 || names.length > MAX_BATCH) throw new HttpError(400, "invalid names");
  if (!ISO_DATE.test(issueDate ?? "")) throw new HttpError(400, "invalid date");
  if (!lifetime && !ISO_DATE.test(expiryDate ?? "")) throw new HttpError(400, "invalid date");
  const clean = names.map(cleanName);

  // 永久會員 have no expiry date.
  const insert = env.DB.prepare(
    `INSERT INTO members (number, name, issue_date, expiry_date, lifetime)
     VALUES (${NEXT_NUMBER_SQL}, ?, ?, ?, ?)
     RETURNING *`,
  );
  const results = await env.DB.batch(
    clean.map((name) => insert.bind(name, issueDate, lifetime ? null : expiryDate, lifetime ? 1 : 0)),
  );
  return results.map((r) => toMember(r.results[0]));
}

async function listMembers(env, url) {
  const q = (url.searchParams.get("q") ?? "").trim();
  const where = [];
  const params = [];
  if (q) {
    if (/^\d+$/.test(q)) {
      where.push("(number = ? OR name LIKE ?)");
      params.push(Number(q), `%${q}%`);
    } else {
      where.push("name LIKE ?");
      params.push(`%${q}%`);
    }
  }
  const sql = `SELECT * FROM members ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY number DESC`;
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return results.map(toMember);
}

// The number the next issued member would get, for previews.
async function nextNumber(env) {
  return (await env.DB.prepare(`SELECT ${NEXT_NUMBER_SQL} AS next`).first()).next;
}

async function setNextNumber(env, body) {
  const next = body?.next;
  if (!Number.isInteger(next) || next < 1 || next > MAX_NUMBER) throw new HttpError(400, "invalid number");
  const { highest } = await env.DB.prepare("SELECT COALESCE(MAX(number), 0) AS highest FROM members").first();
  if (next <= highest) throw new HttpError(409, "too_low", { highest });
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('next_number', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(String(next))
    .run();
  return next;
}

// Printable ASCII only: the passcode travels in an HTTP header, and the login form trims spaces.
const PASSCODE_RULE = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/;
const MIN_PASSCODE = 6;
const MAX_PASSCODE = 64;

async function changePasscode(env, body) {
  const { current, next } = body ?? {};
  if (typeof current !== "string" || !(await passcodeMatches(env, current))) throw new HttpError(403, "wrong_current");
  if (typeof next !== "string" || next.length < MIN_PASSCODE || next.length > MAX_PASSCODE || !PASSCODE_RULE.test(next)) {
    throw new HttpError(400, "invalid_passcode");
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('passcode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(`${salt}:${await hashPasscode(salt, next)}`)
    .run();
}

async function updateMember(env, number, body) {
  const sets = [];
  const params = [];
  if (body?.name !== undefined) {
    sets.push("name = ?");
    params.push(cleanName(body.name));
  }
  if (body?.number !== undefined && body.number !== number) {
    const newNumber = body.number;
    if (!Number.isInteger(newNumber) || newNumber < 1 || newNumber > MAX_NUMBER) throw new HttpError(400, "invalid number");
    const holder = await env.DB.prepare("SELECT name FROM members WHERE number = ?").bind(newNumber).first();
    if (holder) throw new HttpError(409, "duplicate", { number: newNumber, name: holder.name });
    sets.push("number = ?");
    params.push(newNumber);
  }
  // 有效日期: `lifetime: true` clears the date; otherwise a valid first expiry date is required.
  if (body?.lifetime !== undefined || body?.expiryDate !== undefined) {
    if (body.lifetime !== undefined && typeof body.lifetime !== "boolean") throw new HttpError(400, "invalid lifetime");
    if (body.lifetime === true) {
      sets.push("lifetime = 1", "expiry_date = NULL");
    } else {
      if (!ISO_DATE.test(body.expiryDate ?? "")) throw new HttpError(400, "invalid date");
      sets.push("lifetime = 0", "expiry_date = ?");
      params.push(body.expiryDate);
    }
  }
  if (!sets.length) {
    if (body?.number === number) {
      const row = await env.DB.prepare("SELECT * FROM members WHERE number = ?").bind(number).first();
      if (!row) throw new HttpError(404, "not found");
      return toMember(row);
    }
    throw new HttpError(400, "nothing to update");
  }
  let row;
  try {
    row = await env.DB.prepare(`UPDATE members SET ${sets.join(", ")} WHERE number = ? RETURNING *`)
      .bind(...params, number)
      .first();
  } catch (err) {
    // Someone took the number between the check and the update.
    if (/UNIQUE|PRIMARY KEY/i.test(String(err))) throw new HttpError(409, "duplicate", { number: body.number });
    throw err;
  }
  if (!row) throw new HttpError(404, "not found");
  return toMember(row);
}

async function deleteMember(env, number) {
  const { meta } = await env.DB.prepare("DELETE FROM members WHERE number = ?").bind(number).run();
  if (!meta.changes) throw new HttpError(404, "not found");
}

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (!(await authorized(request, env))) throw new HttpError(401, "unauthorized");

  if (pathname === "/api/ping" && method === "GET") return [200, { ok: true }];
  if (pathname === "/api/members" && method === "GET") return [200, { members: await listMembers(env, url) }];
  if (pathname === "/api/members/next" && method === "GET") return [200, { next: await nextNumber(env) }];
  if (pathname === "/api/members/next" && method === "PUT") return [200, { next: await setNextNumber(env, await readJson(request)) }];
  if (pathname === "/api/passcode" && method === "PUT") {
    await changePasscode(env, await readJson(request));
    return [200, { ok: true }];
  }
  if (pathname === "/api/members" && method === "POST") return [201, { members: await issueMembers(env, await readJson(request)) }];

  const match = pathname.match(/^\/api\/members\/(\d+)$/);
  if (match && method === "PATCH") return [200, { member: await updateMember(env, Number(match[1]), await readJson(request)) }];
  if (match && method === "DELETE") {
    await deleteMember(env, Number(match[1]));
    return [200, { deleted: Number(match[1]) }];
  }

  throw new HttpError(404, "not found");
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    let status, body;
    try {
      [status, body] = await route(request, env);
    } catch (err) {
      status = err instanceof HttpError ? err.status : 500;
      body = err instanceof HttpError ? { error: err.message, ...err.details } : { error: "server error" };
      if (status === 500) console.error(err);
    }
    return Response.json(body, { status, headers: cors });
  },
};
