import assert from "node:assert/strict";
import { test } from "node:test";
import { redactPII, redactDeep } from "../lib/ai/redact";

test("redacts email addresses", () => {
  const input = "Contact jane.doe+disputes@merchant-example.com for docs.";
  const out = redactPII(input);
  assert.ok(!out.includes("jane.doe"));
  assert.ok(out.includes("[EMAIL_REDACTED]"));
});

test("redacts card numbers (with spaces and dashes)", () => {
  const cases = [
    "card 4111 1111 1111 1111 charged twice",
    "card 4111-1111-1111-1111 charged twice",
    "card 4111111111111111 charged twice",
  ];
  for (const input of cases) {
    const out = redactPII(input);
    assert.ok(!out.includes("4111111111111111"), `unredacted card in: ${out}`);
    assert.ok(out.includes("[CARD_REDACTED]"), `missing marker in: ${out}`);
  }
});

test("redacts SSNs", () => {
  const out = redactPII("ssn on file: 123-45-6789 should never ship");
  assert.ok(!out.includes("123-45-6789"));
  assert.ok(out.includes("[SSN_REDACTED]"));
});

test("keeps order numbers, dates and non-Luhn digit runs intact", () => {
  const input = "Order 48210 shipped on 2026-10-12, phone 555-0100, ref 9400100000000000123456";
  const out = redactPII(input);
  assert.ok(out.includes("48210"));
  assert.ok(out.includes("2026-10-12"));
  // 9400100000000000123456 fails Luhn -> left alone (tracking-style run)
  assert.ok(out.includes("9400100000000000123456"));
});

test("redacts PII nested in objects and arrays without changing structure", () => {
  const input = {
    dispute: {
      notes: "Buyer mail: sam@buyer.example",
      thread: [{ text: "call 4111 1111 1111 1111 for details" }],
      count: 3,
      flag: null,
    },
  };
  const out = redactDeep(input);
  assert.ok(!out.dispute.notes.includes("sam@buyer.example"));
  assert.ok(out.dispute.thread[0].text.includes("[CARD_REDACTED]"));
  assert.equal(out.dispute.count, 3);
  assert.equal(out.dispute.flag, null);
});