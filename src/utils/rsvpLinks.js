/**
 * The onward links on the RSVP success screen — only the ones the host has
 * switched on (WORKPLAN 106, 28.9). The site link used to go to an unpublished
 * site ("הדף עדיין לא פורסם"), and the gift link ignored the host turning the
 * gift section off. `site.enabled` and `site.sections` reach the rsvp token
 * since migration 20260928000500.
 *
 * @returns {{ inviteUrl: string|null, giftUrl: string|null }}
 */
export function rsvpSuccessLinks(event) {
  const site = event?.site;
  return {
    inviteUrl: event?.inviteToken && site?.enabled ? "/invite/" + event.inviteToken : null,
    giftUrl:   event?.giftToken && site?.sections?.gift !== false ? "/gift/" + event.giftToken : null,
  };
}
