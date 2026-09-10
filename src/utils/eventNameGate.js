/* The event-name gate: a tool is only reachable once the event has a name.
 *
 * Half the product keys off `event.name` — the share links, the invitation, the
 * exports, the site. A draft with no name reaches a screen that cannot render
 * anything useful, so both entry points send the host back to setup first.
 *
 * WHY THIS FILE EXISTS: it was written twice, once in the navigation rail
 * (`Shell.jsx`) and once on the hub (`EventHubScreen.jsx`), token for token
 * identical apart from the local name of the event prop. It got its second copy
 * BECAUSE it had drifted — the hub's own comment records the state it was
 * fixing: "the identical click was blocked from the nav and allowed from the
 * hub". Re-converging a fork by hand does not stop it forking again; that is
 * the whole point of the note in CLAUDE.md that a duplicate maintained by hand
 * will drift. There is one implementation now, and the two screens call it.
 */

/** The only screen reachable without a name — it is where the name is entered. */
export const NAME_GATE_EXEMPT = "setup";

/** Exported so a test can assert the message without re-typing it, which is how
 *  the two copies stayed in sync by luck rather than by construction. */
export const NAME_GATE_MESSAGE = "יש להזין שם לאירוע לפני המשך";

/** Should opening `screenId` be blocked because the event has no name? */
export function isNameGated(event, screenId) {
  // `?.name?.trim()` and not `!event.name`: a name of "   " is not a name, and
  // the setup form accepts whitespace into the field before it is submitted.
  return screenId !== NAME_GATE_EXEMPT && !event?.name?.trim();
}

/** Build the click handler both entry points use.
 *
 *  @param event  the active event (may be undefined while loading)
 *  @param go        navigate to a screen id
 *  @param showToast optional — the rail has it, a caller might not
 */
export function makeOpenScreen(event, { go, showToast }) {
  return (screenId) => {
    if (isNameGated(event, screenId)) {
      showToast?.(NAME_GATE_MESSAGE, "err");
      go(NAME_GATE_EXEMPT);
      return;
    }
    go(screenId);
  };
}
