// Members API for the 會員證 generator. Holds the shared member register in D1 and
// hands out 會員編號 — every batch takes its numbers inside one D1 transaction.

const ALLOWED_ORIGINS = [/^https:\/\/furic\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH = 100;
const MAX_NAME = 30;
const MAX_NUMBER = 99999;

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
  voided: Boolean(row.voided),
  lifetime: Boolean(row.lifetime),
});

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.some((re) => re.test(origin))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function authorized(request, env) {
  const given = new TextEncoder().encode(request.headers.get("Authorization") ?? "");
  const expected = new TextEncoder().encode(`Bearer ${env.PASSCODE}`);
  if (!env.PASSCODE || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given[i] ^ expected[i];
  return diff === 0;
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
     SELECT COALESCE(MAX(number), 0) + 1, ?, ?, ?, ? FROM members
     RETURNING *`,
  );
  const results = await env.DB.batch(
    clean.map((name) => insert.bind(name, issueDate, lifetime ? null : expiryDate, lifetime ? 1 : 0)),
  );
  return results.map((r) => toMember(r.results[0]));
}

async function listMembers(env, url) {
  const q = (url.searchParams.get("q") ?? "").trim();
  const includeVoided = url.searchParams.get("voided") === "1";
  const where = [];
  const params = [];
  if (!includeVoided) where.push("voided = 0");
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

// The number the next issued member would get, for previews. Voided numbers stay used.
async function nextNumber(env) {
  return (await env.DB.prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM members").first()).next;
}

async function updateMember(env, number, body) {
  const sets = [];
  const params = [];
  if (body?.name !== undefined) {
    sets.push("name = ?");
    params.push(cleanName(body.name));
  }
  if (body?.voided !== undefined) {
    sets.push("voided = ?");
    params.push(body.voided ? 1 : 0);
  }
  if (body?.number !== undefined && body.number !== number) {
    const newNumber = body.number;
    if (!Number.isInteger(newNumber) || newNumber < 1 || newNumber > MAX_NUMBER) throw new HttpError(400, "invalid number");
    // Voided members keep their numbers, so they count as taken too.
    const holder = await env.DB.prepare("SELECT name FROM members WHERE number = ?").bind(newNumber).first();
    if (holder) throw new HttpError(409, "duplicate", { number: newNumber, name: holder.name });
    sets.push("number = ?");
    params.push(newNumber);
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

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (!authorized(request, env)) throw new HttpError(401, "unauthorized");

  if (pathname === "/api/ping" && method === "GET") return [200, { ok: true }];
  if (pathname === "/api/members" && method === "GET") return [200, { members: await listMembers(env, url) }];
  if (pathname === "/api/members/next" && method === "GET") return [200, { next: await nextNumber(env) }];
  if (pathname === "/api/members" && method === "POST") return [201, { members: await issueMembers(env, await readJson(request)) }];

  const match = pathname.match(/^\/api\/members\/(\d+)$/);
  if (match && method === "PATCH") return [200, { member: await updateMember(env, Number(match[1]), await readJson(request)) }];

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
