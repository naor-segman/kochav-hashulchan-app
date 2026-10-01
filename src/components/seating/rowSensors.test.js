// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { startedOnControl, RowMouseSensor, RowTouchSensor } from "./rowSensors.js";

/* Sixth review 30.9: after the switch to MouseSensor (סב88a), a press on the
 * select or a button inside a guest row started a drag and seated the guest. */
function row() {
  const r = document.createElement("div");
  r.setAttribute("role", "button");            // what useDraggable puts on the row
  r.innerHTML = `<span class="name">דנה</span><select><option>1</option></select><button>נעילה</button>`;
  document.body.appendChild(r);
  return r;
}
const ev = (row, target) => ({ currentTarget: row, nativeEvent: { target, button: 0, touches: [{}] } });

describe("a press on a control inside a draggable row is not a drag", () => {
  it("the select and the button are controls; the name and the row itself are not", () => {
    const r = row();
    expect(startedOnControl(ev(r, r.querySelector("select")))).toBe(true);
    expect(startedOnControl(ev(r, r.querySelector("button")))).toBe(true);
    expect(startedOnControl(ev(r, r.querySelector(".name")))).toBe(false);
    expect(startedOnControl(ev(r, r))).toBe(false);
  });
  it("the sensors refuse to activate from a control and activate from the row", () => {
    const r = row();
    for (const S of [RowMouseSensor, RowTouchSensor]) {
      const [{ handler }] = S.activators;
      let activated = 0;
      const opts = { onActivation: () => { activated++; } };
      expect(handler(ev(r, r.querySelector("select")), opts)).toBe(false);
      expect(handler(ev(r, r.querySelector(".name")), opts)).toBe(true);
      expect(activated).toBe(1);
    }
  });
});
