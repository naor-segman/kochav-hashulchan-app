import { describe, it, expect } from "vitest";
import { rsvpSuccessLinks } from "./rsvpLinks.js";

const ev = (site) => ({ inviteToken: "inv12345", giftToken: "gift1234", site });

describe("RSVP success screen — only links the host switched on (106)", () => {
  it("both, when the site is published and the gift section is on", () => {
    expect(rsvpSuccessLinks(ev({ enabled: true, sections: { gift: true } })))
      .toEqual({ inviteUrl: "/invite/inv12345", giftUrl: "/gift/gift1234" });
  });
  it("no site link to an unpublished site", () => {
    expect(rsvpSuccessLinks(ev({ enabled: false, sections: {} })).inviteUrl).toBeNull();
  });
  it("no gift link when the host turned gifts off", () => {
    expect(rsvpSuccessLinks(ev({ enabled: true, sections: { gift: false } })).giftUrl).toBeNull();
  });
  it("nothing without tokens or a site", () => {
    expect(rsvpSuccessLinks({})).toEqual({ inviteUrl: null, giftUrl: null });
    expect(rsvpSuccessLinks(ev(null)).inviteUrl).toBeNull();
  });
});
