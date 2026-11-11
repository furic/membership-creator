// Talks to the members API (worker/). The shared passcode is kept in this browser.
import { config } from "./config.js";
import { t } from "./i18n.js";

const STORAGE_KEY = "membership.passcode";
let memoryPasscode = "";

export class AuthError extends Error {}

export const passcode = {
  get() {
    try {
      return localStorage.getItem(STORAGE_KEY) || memoryPasscode;
    } catch {
      return memoryPasscode;
    }
  },
  set(value) {
    memoryPasscode = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}
  },
  clear() {
    memoryPasscode = "";
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  },
};

async function request(path, { method = "GET", body, code = passcode.get() } = {}) {
  let res;
  try {
    res = await fetch(config.apiBase + path, {
      method,
      headers: { Authorization: `Bearer ${code}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(t("error.offline"));
  }
  if (res.status === 401) throw new AuthError(t("error.wrongPasscode"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(t("error.failed", { reason: data.error || res.status }));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const ping = (code) => request("/api/ping", { code });

export const issue = async (names, issueDate, expiryDate, lifetime = false) =>
  (await request("/api/members", { method: "POST", body: { names, issueDate, expiryDate, lifetime } })).members;

export const list = async (q = "") => (await request(`/api/members?${new URLSearchParams(q ? { q } : {})}`)).members;

export const nextNumber = async () => (await request("/api/members/next")).next;

export const setNextNumber = async (next) => (await request("/api/members/next", { method: "PUT", body: { next } })).next;

export const changePasscode = (current, next) => request("/api/passcode", { method: "PUT", body: { current, next } });

export const update = async (number, patch) =>
  (await request(`/api/members/${number}`, { method: "PATCH", body: patch })).member;

export const remove = (number) => request(`/api/members/${number}`, { method: "DELETE" });
