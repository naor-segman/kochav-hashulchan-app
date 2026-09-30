/**
 * The next `count` names for tables with this prefix. Continues from the
 * highest number ALREADY used with the prefix, not from the table count:
 * after deleting "שולחן 2" the count-based version produced a second
 * "שולחן 3" — and the WhatsApp message and the printed entry card both name
 * the table, so two tables answered to one number.
 */
export function nextTableNames(tables, prefix, count) {
  const used = new Set((tables || []).map(t => (t.name || "").trim()));
  const rx   = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+(\\d+)$");
  let next = 0;
  for (const t of tables || []) {
    const m = rx.exec((t.name || "").trim());
    if (m) next = Math.max(next, Number(m[1]));
  }
  return Array.from({ length: count }, () => {
    let n = ++next;
    while (used.has(prefix + " " + n)) n = ++next;
    used.add(prefix + " " + n);
    return prefix + " " + n;
  });
}
