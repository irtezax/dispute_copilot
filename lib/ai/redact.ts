/**
 * PII redaction — runs on every payload BEFORE it leaves for the LLM API.
 * Redacts: email addresses, card-like digit runs (13-19 digits), and SSNs.
 */

const REDACTED = {
  email: "[EMAIL_REDACTED]",
  card: "[CARD_REDACTED]",
  ssn: "[SSN_REDACTED]",
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// SSN first so 123-45-6789 is never swallowed by the card pattern.
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const DIGIT_RUN_RE = /\b(?:\d[ -]?){12,19}\b/g;

function looksLikeCardNumber(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  // Luhn check — filters out tracking-ish digit runs that would be over-redacted.
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Redact PII occurrences in a single string. */
export function redactPII(text: string): string {
  return text
    .replace(EMAIL_RE, REDACTED.email)
    .replace(SSN_RE, REDACTED.ssn)
    .replace(DIGIT_RUN_RE, (match) => (looksLikeCardNumber(match) ? REDACTED.card : match));
}

/**
 * Deep-redact any JSON-serializable value (strings inside objects and arrays)
 * while preserving structure, so the LLM still receives the case shape.
 */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redactPII(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactDeep(val);
    }
    return out as unknown as T;
  }
  return value;
}