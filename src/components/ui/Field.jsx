import { Children, cloneElement, isValidElement, useId } from "react";
import styles from "./Field.module.css";

/**
 * Labelled form field.
 *
 * The visible <label> used to sit beside the control with no association, so
 * screen readers announced the inputs as unlabelled and clicking the label did
 * nothing. The label now carries an id and:
 *   - a lone form control is associated through htmlFor (standard pairing);
 *   - several controls are wrapped in a role="group" labelled by that id, which
 *     is the right shape for a set of related inputs (e.g. companion names)
 *     rather than pointing one label at many controls.
 *
 * Call sites are unchanged, and a child that already has an id keeps it.
 */
const CONTROL_TAGS = ["input", "select", "textarea"];

/** An intrinsic form control — the thing a <label> should actually point at. */
function isControl(node) {
  return isValidElement(node) && CONTROL_TAGS.includes(node.type);
}

export default function Field({ label, required, hint, children }) {
  const labelId   = useId();
  const controlId = useId();

  const kids = Children.toArray(children);

  // Fields routinely render their control plus a CONDITIONAL sibling — an error
  // line, a hint, a counter. Counting raw children meant the field silently
  // switched from htmlFor to the group wrapper the moment that sibling
  // appeared, so the label stopped naming the input exactly when a form was
  // showing an error. Find the control itself instead of counting.
  const controls = kids.filter(isControl);
  const only = controls.length === 1
    ? controls[0]
    // A single custom-component child (Select, DatePicker…) still pairs
    // directly, as before.
    : (kids.length === 1 && isValidElement(kids[0]) ? kids[0] : null);

  const targetId = only?.props?.id || controlId;

  const withId = node => node !== only ? node : cloneElement(node, {
    id: targetId,
    ...(required && node.props["aria-required"] === undefined
      ? { "aria-required": "true" }
      : {}),
  });

  return (
    <div className={styles.field}>
      <label
        id={labelId}
        className={styles.label}
        htmlFor={only ? targetId : undefined}
      >
        {label}
        {required && <span className={styles.required}>*</span>}
        {hint && <span className={styles.labelHint}> — {hint}</span>}
      </label>

      {only
        ? kids.map(withId)
        : <div role="group" aria-labelledby={labelId}>{children}</div>}
    </div>
  );
}
