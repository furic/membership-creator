import { exports } from "cloudflare:workers";
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

const BASE = "https://api.test";
const AUTH = { Authorization: "Bearer test-pass", "Content-Type": "application/json" };

beforeEach(async () => {
  await env.DB.exec("DELETE FROM members");
  await env.DB.exec("DELETE FROM settings");
});

const call = (path, init = {}) =>
  exports.default.fetch(new Request(BASE + path, { ...init, headers: { ...AUTH, ...init.headers } }));

const issue = (names, issueDate = "2026-11-04", expiryDate = "2027-11-04") =>
  call("/api/members", { method: "POST", body: JSON.stringify({ names, issueDate, expiryDate }) });

describe("auth", () => {
  it("rejects a missing or wrong passcode", async () => {
    const none = await exports.default.fetch(new Request(BASE + "/api/ping"));
    expect(none.status).toBe(401);
    const wrong = await call("/api/ping", { headers: { Authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
    const ok = await call("/api/ping");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
  });
});

describe("changing the passcode", () => {
  const change = (current, next, auth = "test-pass") =>
    call("/api/passcode", {
      method: "PUT",
      headers: { Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ current, next }),
    });
  const ping = (code) => call("/api/ping", { headers: { Authorization: `Bearer ${code}` } });

  it("replaces the passcode: the new one works, the old one stops working", async () => {
    const res = await change("test-pass", "new-pass-1");
    expect(res.status).toBe(200);
    expect((await ping("new-pass-1")).status).toBe(200);
    expect((await ping("test-pass")).status).toBe(401);

    expect((await change("new-pass-1", "third pass", "new-pass-1")).status).toBe(200);
    expect((await ping("third pass")).status).toBe(200);
    expect((await ping("new-pass-1")).status).toBe(401);
  });

  it("does not store the passcode in plain text", async () => {
    await change("test-pass", "new-pass-1");
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'passcode'").first();
    expect(row.value).not.toContain("new-pass-1");
  });

  it("falls back to the PASSCODE secret when the stored passcode is removed", async () => {
    await change("test-pass", "new-pass-1");
    await env.DB.exec("DELETE FROM settings WHERE key = 'passcode'");
    expect((await ping("test-pass")).status).toBe(200);
  });

  it("requires the current passcode", async () => {
    const res = await change("wrong", "new-pass-1");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "wrong_current" });
    expect((await ping("test-pass")).status).toBe(200);
  });

  it("rejects passcodes that are too short, too long, padded or not plain ASCII", async () => {
    for (const next of ["12345", "x".repeat(65), " padded", "padded ", "會員密碼123", 123456, ""]) {
      expect((await change("test-pass", next)).status).toBe(400);
    }
    expect((await ping("test-pass")).status).toBe(200);
  });
});

describe("issuing", () => {
  it("numbers a batch in input order", async () => {
    const res = await issue(["陳大文", "李小梅", "黃志明"]);
    expect(res.status).toBe(201);
    const { members } = await res.json();
    expect(members).toEqual([
      { number: 1, name: "陳大文", issueDate: "2026-11-04", expiryDate: "2027-11-04", lifetime: false },
      { number: 2, name: "李小梅", issueDate: "2026-11-04", expiryDate: "2027-11-04", lifetime: false },
      { number: 3, name: "黃志明", issueDate: "2026-11-04", expiryDate: "2027-11-04", lifetime: false },
    ]);
  });

  it("never hands out the same number to two batches at once", async () => {
    const names = (p) => [1, 2, 3, 4, 5].map((i) => `${p}${i}`);
    const [a, b] = await Promise.all([issue(names("甲")), issue(names("乙"))]);
    const numbers = [...(await a.json()).members, ...(await b.json()).members].map((m) => m.number);
    expect(numbers.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("issues lifetime members without an expiry date", async () => {
    const res = await call("/api/members", {
      method: "POST",
      body: JSON.stringify({ names: ["陳大文"], issueDate: "2026-11-04", lifetime: true }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).members).toEqual([
      { number: 1, name: "陳大文", issueDate: "2026-11-04", expiryDate: null, lifetime: true },
    ]);
    const listed = await (await call("/api/members")).json();
    expect(listed.members[0]).toMatchObject({ lifetime: true, expiryDate: null });
  });

  it("rejects bad input", async () => {
    expect((await issue([])).status).toBe(400);
    expect((await issue(["  "])).status).toBe(400);
    expect((await issue(["陳".repeat(31)])).status).toBe(400);
    expect((await issue(["陳大文"], "04/11/2026")).status).toBe(400);
    expect((await issue(["陳大文"], "2026-11-04", "")).status).toBe(400);
  });
});

describe("register", () => {
  it("searches by name or number, newest first", async () => {
    await issue(["陳大文", "李小梅", "李大衛"]);
    const byName = await (await call("/api/members?q=" + encodeURIComponent("李"))).json();
    expect(byName.members.map((m) => m.number)).toEqual([3, 2]);
    const byNumber = await (await call("/api/members?q=002")).json();
    expect(byNumber.members.map((m) => m.name)).toEqual(["李小梅"]);
    const all = await (await call("/api/members")).json();
    expect(all.members.map((m) => m.number)).toEqual([3, 2, 1]);
  });

  it("renames without renumbering", async () => {
    await issue(["陳大文", "李小梅"]);
    const renamed = await call("/api/members/1", { method: "PATCH", body: JSON.stringify({ name: "陳大明" }) });
    expect((await renamed.json()).member).toMatchObject({ number: 1, name: "陳大明" });
    expect((await call("/api/members/99", { method: "PATCH", body: JSON.stringify({ name: "x" }) })).status).toBe(404);
  });

  it("deletes a member permanently", async () => {
    await issue(["陳大文", "李小梅", "黃志明"]);
    const res = await call("/api/members/2", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    const all = await (await call("/api/members")).json();
    expect(all.members.map((m) => m.number)).toEqual([3, 1]);
    expect((await call("/api/members/2", { method: "DELETE" })).status).toBe(404);
  });
});

describe("renumbering", () => {
  const patch = (n, body) => call(`/api/members/${n}`, { method: "PATCH", body: JSON.stringify(body) });

  it("moves a member to a free number", async () => {
    await issue(["陳大文", "李小梅"]);
    const res = await patch(2, { number: 10 });
    expect(res.status).toBe(200);
    expect((await res.json()).member).toMatchObject({ number: 10, name: "李小梅" });
    const all = await (await call("/api/members")).json();
    expect(all.members.map((m) => m.number)).toEqual([10, 1]);
    expect(await (await call("/api/members/next")).json()).toEqual({ next: 11 });
  });

  it("refuses a number that is already used and says by whom, but reuses a deleted member's number", async () => {
    await issue(["陳大文", "李小梅", "黃志明"]);
    const taken = await patch(1, { number: 2 });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "duplicate", number: 2, name: "李小梅" });
    expect((await patch(1, { number: 1 })).status).toBe(200); // same number is a no-op

    await call("/api/members/3", { method: "DELETE" });
    const moved = await patch(1, { number: 3 });
    expect(moved.status).toBe(200);
    expect((await moved.json()).member).toMatchObject({ number: 3, name: "陳大文" });
  });

  it("rejects numbers that are not positive whole numbers", async () => {
    await issue(["陳大文"]);
    for (const number of [0, -1, 1.5, "abc", 100000]) expect((await patch(1, { number })).status).toBe(400);
  });
});

describe("next number", () => {
  it("is 1 for an empty register, then highest number + 1", async () => {
    expect(await (await call("/api/members/next")).json()).toEqual({ next: 1 });
    await issue(["陳大文", "李小梅", "黃志明"]);
    await call("/api/members/2", { method: "DELETE" });
    expect(await (await call("/api/members/next")).json()).toEqual({ next: 4 });
  });
});

describe("setting the next number", () => {
  const setNext = (next) => call("/api/members/next", { method: "PUT", body: JSON.stringify({ next }) });

  it("makes new batches continue from the chosen number", async () => {
    const res = await setNext(50);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ next: 50 });
    expect(await (await call("/api/members/next")).json()).toEqual({ next: 50 });
    const { members } = await (await issue(["陳大文", "李小梅"])).json();
    expect(members.map((m) => m.number)).toEqual([50, 51]);
    expect(await (await call("/api/members/next")).json()).toEqual({ next: 52 });
  });

  it("can be lowered again, but not to or below the highest existing number", async () => {
    await setNext(50);
    await issue(["陳大文", "李小梅", "黃志明"]); // 50, 51, 52
    const low = await setNext(52);
    expect(low.status).toBe(409);
    expect(await low.json()).toEqual({ error: "too_low", highest: 52 });
    expect((await setNext(60)).status).toBe(200);
    expect((await setNext(53)).status).toBe(200);
    expect(await (await call("/api/members/next")).json()).toEqual({ next: 53 });
  });

  it("rejects numbers that are not positive whole numbers", async () => {
    for (const next of [0, -1, 2.5, "abc", 100000]) expect((await setNext(next)).status).toBe(400);
  });
});

describe("cors", () => {
  const preflight = (origin) =>
    exports.default.fetch(new Request(BASE + "/api/members", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    }));

  it("allows the GitHub Pages site and localhost only", async () => {
    expect((await preflight("https://furic.github.io")).headers.get("Access-Control-Allow-Origin")).toBe("https://furic.github.io");
    expect((await preflight("http://localhost:8080")).headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8080");
    expect((await preflight("https://evil.example")).headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
