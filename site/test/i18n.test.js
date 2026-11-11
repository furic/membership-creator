import test from "node:test";
import assert from "node:assert/strict";
import { setMessages, t } from "../js/i18n.js";

test("t fills {{placeholders}} and falls back to the key", () => {
  setMessages({ hi: "Hi {{name}}" });
  assert.equal(t("hi", { name: "Ann" }), "Hi Ann");
  assert.equal(t("missing.key"), "missing.key");
});

test("a count of 1 uses the _one form when there is one", () => {
  setMessages({ n: "{{count}} sheets", n_one: "1 sheet" });
  assert.equal(t("n", { count: 1 }), "1 sheet");
  assert.equal(t("n", { count: 2 }), "2 sheets");
});

test("a language that overrides a key without _one drops the base language's _one", () => {
  setMessages({ n: "{{count}} sheets", n_one: "1 sheet", other_one: "x" }, { n: "{{count}} 張" });
  assert.equal(t("n", { count: 1 }), "1 張");
  assert.equal(t("other", { count: 1 }), "x", "keys the language does not give keep the base forms");
});
