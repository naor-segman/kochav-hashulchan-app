import { MouseSensor, TouchSensor, KeyboardSensor } from "@dnd-kit/core";

/* A press that starts on a control INSIDE a draggable row — the waiting
 * list's table select, a table card's lock / "back to waiting" / WhatsApp
 * buttons — is that control's, not a drag.
 *
 * The controls used to say so by stopping `pointerdown`, which is what the
 * PointerSensor listened to. The switch to MouseSensor + TouchSensor (סב88a)
 * moved activation to `mousedown` / `touchstart`, which those stoppers never
 * saw: pressing the select and moving seated the guest (sixth review 30.9,
 * measured in Chromium). Deciding it here, by what was pressed, covers every
 * control in every row without each one having to remember. */
const CONTROLS = "button, select, input, textarea, a[href], [role='button'], [data-no-dnd]";

export function startedOnControl(event) {
  const row = event.currentTarget;
  const target = event.nativeEvent?.target ?? event.target;
  if (!(target instanceof Element)) return false;
  const control = target.closest(CONTROLS);
  return !!control && control !== row && (!row || row.contains(control));
}

const guard = (Sensor) => Sensor.activators.map(a => ({
  eventName: a.eventName,
  handler: (event, ...rest) => (startedOnControl(event) ? false : a.handler(event, ...rest)),
}));

export class RowMouseSensor extends MouseSensor {
  static activators = guard(MouseSensor);
}

export class RowTouchSensor extends TouchSensor {
  static activators = guard(TouchSensor);
}

/* Space / Enter on a control inside a draggable (the ✕ in a sketch chip's
 * header) is that control's press. dnd-kit's own check only applies when an
 * activator node is registered, which these draggables do not do (AX8). */
export class RowKeyboardSensor extends KeyboardSensor {
  static activators = guard(KeyboardSensor);
}
