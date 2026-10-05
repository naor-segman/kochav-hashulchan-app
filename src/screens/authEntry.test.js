import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* WORKPLAN 136, stage C (owner, 5.10). The sign-in screens as the owner set
   them: "המשיכו בלי חשבון" is a full button, not a small link; the screens
   carry the new design (square, light, a photo half on a desktop); and no
   "מצב אורח" — in a product about guests it reads as the guest's own view. */
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const SCREENS = ["./LoginScreen.jsx", "./SignupScreen.jsx", "./ResetPasswordScreen.jsx", "./AuthCallbackScreen.jsx"];
const css = read("./LoginScreen.module.css");

describe("sign-in screens (136 stage C)", () => {
  for (const f of ["./LoginScreen.jsx", "./SignupScreen.jsx"]) {
    it(`${f}: continuing without an account is a full button into the app`, () => {
      expect(read(f)).toContain('<Link to="/app" className={styles.guestBtn}>המשיכו בלי חשבון ←</Link>');
    });
  }

  it("the button is a button: full width, 48px, a real border", () => {
    const rule = css.match(/\.guestBtn \{[^}]*\}/)[0];
    expect(rule).toMatch(/display: flex/);
    expect(rule).toMatch(/min-height: 48px/);
    expect(rule).toMatch(/border: 1\.5px solid/);
  });

  for (const f of SCREENS) {
    it(`${f}: no "מצב אורח", and the photo half is there`, () => {
      const s = read(f);
      expect(s).not.toMatch(/מצב אורח/);
      expect(s).toMatch(/<AuthAside \/>/);
    });
  }

  it("square and still: no rounded corners, no bouncing entrance", () => {
    expect(css).not.toMatch(/border-radius: var\(--radius/);
    expect(css).not.toMatch(/popIn/);
    expect(read("../components/auth/AuthAside.module.css")).not.toMatch(/border-radius/);
  });

  it("no near-black page ground", () => {
    expect(css.match(/\.page \{[^}]*\}/)[0]).not.toMatch(/--nav-bg/);
  });
});
