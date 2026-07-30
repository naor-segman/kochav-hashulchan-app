/**
 * How a table is named to a human.
 *
 * TableBuilderScreen's default name prefix is already the word "שולחן", so six
 * call sites that rendered `שולחן {t.name}` produced "שולחן שולחן 1" for every
 * default-named table — including the printed name cards a guest picks up off
 * the table, and the WhatsApp message telling them where to sit.
 *
 * The name is the host's, so it is rendered as it is. The word is added only
 * when the name does not already open with it, which is what makes a table
 * called "אביר 3" or "12" still read as a table.
 */
const PREFIX = "שולחן";

export function tableLabel(table) {
  const name = String(table?.name ?? "").trim();
  if (!name) return PREFIX;
  if (name === PREFIX || name.startsWith(PREFIX + " ")) return name;
  return PREFIX + " " + name;
}

export default tableLabel;
