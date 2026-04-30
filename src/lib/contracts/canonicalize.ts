// Deterministic JSON serialisation for contract bodies.
//
// Two contract bodies that mean the same thing must hash to the same string,
// otherwise signatures collected on functionally-identical bodies would not
// reconcile. JSON.stringify is non-deterministic on object key order; this
// canonicaliser walks the structure, sorts object keys lexicographically,
// and emits a single string that matches the JSON spec — no whitespace, no
// trailing commas. Arrays preserve order (semantically meaningful — the
// list of signatories is ordered by the order they were added).
//
// Numbers are emitted via JSON.stringify, which is portable. NaN / Infinity
// are not valid JSON and must be rejected upstream; passing them here would
// emit `null` per JS semantics, masking the bug — guard at validation.

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  // undefined / function / symbol — invalid JSON. The validator should
  // strip these before they reach here; emit null to preserve bytes-safe
  // output rather than throwing.
  return "null";
}
