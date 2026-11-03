import { exports } from "cloudflare:workers";
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

const BASE = "https://api.test";
const AUTH = { Authorization: "Bearer test-pass", "Content-Type": "application/json" };

beforeEach(async () => {
  await env.DB.exec("DELETE FROM members");
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

describe("issuing", () => {
  it("numbers a batch in input order", async () => {
    const res = await issue(["陳大文", "李小梅", "黃志明"]);
    expect(res.status).toBe(201);
    const { members } = await res.json();
    expect(members).toEqual([
      { number: 1, name: "陳大文", issueDate: "2026-11-04", expiryDate: "2027-11-04", voided: false },
      { number: 2, name: "李小梅", issueDate: "2026-11-04", expiryDate: "2027-11-04", voided: false },
      { number: 3, name: "黃志明", issueDate: "2026-11-04", expiryDate: "2027-11-04", voided: false },
    ]);
  });

  it("never hands out the same number to two batches at once", async () => {
    const names = (p) => [1, 2, 3, 4, 5].map((i) => `${p}${i}`);
    const [a, b] = await Promise.all([issue(names("甲")), issue(names("乙"))]);
    const numbers = [...(await a.json()).members, ...(await b.json()).members].map((m) => m.number);
    expect(numbers.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
  it("searches by name or number, newest first, hiding voided rows", async () => {
    await issue(["陳大文", "李小梅", "李大衛"]);
    const byName = await (await call("/api/members?q=" + encodeURIComponent("李"))).json();
    expect(byName.members.map((m) => m.number)).toEqual([3, 2]);
    const byNumber = await (await call("/api/members?q=002")).json();
    expect(byNumber.members.map((m) => m.name)).toEqual(["李小梅"]);
    const all = await (await call("/api/members")).json();
    expect(all.members.map((m) => m.number)).toEqual([3, 2, 1]);
  });

  it("renames without renumbering, and voids", async () => {
    await issue(["陳大文", "李小梅"]);
    const renamed = await call("/api/members/1", { method: "PATCH", body: JSON.stringify({ name: "陳大明" }) });
    expect((await renamed.json()).member).toMatchObject({ number: 1, name: "陳大明" });

    await call("/api/members/2", { method: "PATCH", body: JSON.stringify({ voided: true }) });
    const visible = await (await call("/api/members")).json();
    expect(visible.members.map((m) => m.number)).toEqual([1]);
    const withVoided = await (await call("/api/members?voided=1")).json();
    expect(withVoided.members.map((m) => [m.number, m.voided])).toEqual([[2, true], [1, false]]);

    const next = await (await issue(["新會員"])).json();
    expect(next.members[0].number).toBe(3);

    expect((await call("/api/members/99", { method: "PATCH", body: JSON.stringify({ name: "x" }) })).status).toBe(404);
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
