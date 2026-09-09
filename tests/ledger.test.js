const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../core/ledger");
const { randomUUID: id } = require("node:crypto");
function setup() {
  let s = L.initial("desktop", "vault");
  s = L.mutate(
    s,
    "currency",
    { id: "npr", code: "NPR", name: "Nepalese rupee", digits: 2 },
    false,
    id()
  );
  for (const name of ["cash", "bank"])
    s = L.mutate(
      s,
      "account",
      { id: name, name, currency: "npr", opening: 100000 },
      false,
      id()
    );
  return s;
}
function entry(overrides = {}) {
  return {
    id: id(),
    type: "expense",
    account: "cash",
    to: null,
    amount: 75000,
    fee: 500,
    date: "2026-09-09",
    time: null,
    category: "Food",
    description: "Lunch",
    ...overrides,
  };
}
test("money parsing is exact, bounded and precision-aware", () => {
  assert.equal(L.parse("750.25", 2), 75025);
  assert.equal(L.parse("-0.01", 2), -1);
  assert.equal(L.money(-1, 2), "-0.01");
  assert.equal(L.parse("123", 0), 123);
  for (const s of ["1e2", "NaN", "0.001", "90000000000000"])
    assert.throws(() => L.parse(s, 2));
  assert.equal(L.parse("0.10", 2) + L.parse("0.20", 2), 30);
});
test("fees, transfers and adjustments preserve reporting semantics", () => {
  let s = setup();
  for (const e of [
    entry(),
    entry({ type: "income", amount: 10000, fee: 0 }),
    entry({ type: "transfer", to: "bank", amount: 5000, fee: 100 }),
    entry({ type: "adjustment", amount: -250, fee: 0 }),
  ])
    s = L.mutate(s, "entry", e, false, id());
  assert.equal(L.balance(s, "cash"), 29150);
  assert.equal(L.balance(s, "bank"), 105000);
  assert.deepEqual(L.summary(s, "npr", "2026-09"), {
    balance: 134150,
    income: 10000,
    expense: 75000,
    fees: 600,
    adjustment: -250,
    net: -65600,
  });
});
test("editing and deleting reverses old balance effects", () => {
  let s = setup(),
    e = entry();
  s = L.mutate(s, "entry", e, false, id());
  s = L.mutate(s, "entry", { ...e, amount: 10 }, false, id());
  assert.equal(L.balance(s, "cash"), 99490);
  s = L.mutate(s, "entry", { ...e, amount: 10 }, true, id());
  assert.equal(L.balance(s, "cash"), 100000);
  assert.equal(L.history(s).length, 0);
});
test("invalid operations leave input state unchanged", () => {
  let s = setup(),
    before = JSON.stringify(s);
  for (const e of [
    entry({ amount: 0 }),
    entry({ fee: -1 }),
    entry({ type: "income", fee: 1 }),
    entry({ date: "2026-02-30" }),
    entry({ time: "25:00" }),
    entry({ type: "transfer", to: "cash" }),
  ])
    assert.throws(() => L.mutate(s, "entry", e, false, id()));
  assert.equal(JSON.stringify(s), before);
});
test("cross-currency transfers are rejected", () => {
  let s = setup();
  s = L.mutate(
    s,
    "currency",
    { id: "usd", code: "USD", name: "Dollar", digits: 2 },
    false,
    id()
  );
  s = L.mutate(
    s,
    "account",
    { id: "dollar", name: "Dollar", currency: "usd", opening: 0 },
    false,
    id()
  );
  assert.throws(() =>
    L.mutate(s, "entry", entry({ type: "transfer", to: "dollar" }), false, id())
  );
});
test("concurrent edits are retained and explicit resolution converges", () => {
  let a = setup(),
    e = entry();
  a = L.mutate(a, "entry", e, false, id());
  let b = { ...structuredClone(a), device: "phone" };
  a = L.mutate(a, "entry", { ...e, amount: 80000 }, false, id());
  b = L.mutate(b, "entry", { ...e, amount: 85000 }, false, id());
  let merged = L.merge(a, L.changes(b, a.clock));
  assert.equal(L.conflicts(merged).length, 1);
  let conflict = L.conflicts(merged)[0];
  merged = L.resolve(merged, conflict.key, conflict.versions[0].id, id());
  assert.equal(L.conflicts(merged).length, 0);
  b = L.merge(b, L.changes(merged, b.clock));
  assert.deepEqual(L.rows(b, "entry"), L.rows(merged, "entry"));
  assert.equal(L.conflicts(b).length, 0);
});
test("delete versus edit is a conflict and tombstones prevent resurrection", () => {
  let a = setup(),
    e = entry();
  a = L.mutate(a, "entry", e, false, id());
  let b = { ...structuredClone(a), device: "phone" };
  a = L.mutate(a, "entry", e, true, id());
  let c = L.merge(b, L.changes(a, b.clock));
  assert.equal(L.rows(c, "entry").length, 0);
  assert.equal(L.rows(L.merge(c, b.events), "entry").length, 0);
  b = L.mutate(b, "entry", { ...e, amount: 1 }, false, id());
  assert.equal(L.conflicts(L.merge(a, L.changes(b, a.clock))).length, 1);
});
test("retry is idempotent, missing dependencies and forged sequence are rejected", () => {
  const a = setup();
  assert.deepEqual(L.merge(a, a.events), a);
  assert.throws(() => L.merge(L.initial("phone", "vault"), [a.events[2]]));
  const forged = structuredClone(a.events[0]);
  forged.id = id();
  assert.throws(() => L.merge(a, [forged]));
});
test("CSV quoted fields, import preview, duplicate detection and atomic errors", () => {
  let s = setup(),
    text =
      'Date,Description,Debit,Credit,Fee\r\n2026-09-09,"Food, cafe",750,,5\r\n2026-09-10,Salary,,1000,0\r\n';
  const map = {
    date: "Date",
    description: "Description",
    debit: "Debit",
    credit: "Credit",
    fee: "Fee",
  };
  let p = L.preview(s, text, map, "cash", id);
  assert.equal(p[0].entry.amount, 75000);
  assert.equal(L.rows(s, "entry").length, 0);
  s = L.importRows(s, p, false, id);
  p = L.preview(s, text, map, "cash", id);
  assert.ok(p.every((r) => r.duplicate));
  assert.equal(L.rows(L.importRows(s, p, false, id), "entry").length, 2);
  assert.throws(() => L.importRows(s, [...p, { error: "Bad date" }], true, id));
  assert.throws(() => L.csvParse('a,b\n"unclosed,b'));
  assert.equal(L.csvParse(L.csvExport(s)).rows.length, 2);
});
test("backup validation, restore and filters", () => {
  let s = setup();
  s = L.mutate(s, "entry", entry(), false, id());
  const b = L.backup(s);
  assert.equal(b.includes("private"), false);
  let restored = L.restore(b, "newdevice", "newvault");
  assert.equal(restored.vault, "newvault");
  assert.equal(L.balance(restored, "cash"), 24500);
  assert.equal(
    L.history(s, {
      text: "lunch",
      min: 70000,
      max: 80000,
      from: "2026-09-01",
      until: "2026-09-30",
    }).length,
    1
  );
  assert.equal(L.history(s, { type: "income" }).length, 0);
  assert.throws(() => L.restore('{"version":2}', "new", "vault"));
});
test("event retries are independent of JSON object key ordering", () => {
  const s = setup();
  function reorder(v) {
    if (Array.isArray(v)) return v.map(reorder);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v)
          .reverse()
          .map((k) => [k, reorder(v[k])])
      );
    return v;
  }
  assert.deepEqual(L.merge(s, reorder(s.events)), s);
});
test("reserved object keys cannot become device identities", () => {
  for (const name of ["__proto__", "constructor", "prototype"])
    assert.throws(() => L.initial(name, "vault"));
});
test("three devices converge after independent offline additions and relaying", () => {
  let a = setup(),
    b = { ...structuredClone(a), device: "phone" },
    c = { ...structuredClone(a), device: "third" };
  a = L.mutate(a, "entry", entry({ amount: 10 }), false, id());
  b = L.mutate(b, "entry", entry({ amount: 20 }), false, id());
  c = L.mutate(c, "entry", entry({ amount: 30 }), false, id());
  b = L.merge(b, L.changes(a, b.clock));
  c = L.merge(c, L.changes(b, c.clock));
  a = L.merge(a, L.changes(c, a.clock));
  b = L.merge(b, L.changes(a, b.clock));
  assert.deepEqual(L.history(a), L.history(b));
  assert.deepEqual(L.history(b), L.history(c));
});
test("categories remain available after their last entry is deleted", () => {
  let s = setup(),
    e = entry({ category: "Research travel" });
  s = L.mutate(s, "entry", e, false, id());
  s = L.mutate(s, "entry", e, true, id());
  assert.ok(L.rows(s, "category").some((c) => c.name === "Research travel"));
});
test("large CSV import commits all entries and preserves failed-input atomicity", () => {
  const s = setup();
  const text =
    "date,amount\n" +
    Array.from({ length: 1000 }, () => "2026-09-09,1").join("\n");
  const p = L.preview(s, text, { date: "date", amount: "amount" }, "cash", id);
  const next = L.importRows(s, p, true, id);
  assert.equal(L.rows(next, "entry").length, 1000);
  assert.equal(L.rows(s, "entry").length, 0);
});
