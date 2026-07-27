import { Children, cloneElement, isValidElement, useId } from "react";
import styles from "./Field.module.css";

/**
 * Labelled form field.
 *
 * The visible <label> used to sit beside the control with no association, so
 * screen readers announced the inputs as unlabelled and clicking the label did
 * nothing. The label now carries an id and:
 *   - a single element child is associated through htmlFor (standard pairing);
 *   - several children are wrapped in a role="group" labelled by that id, which
 *     is the right shape for a set of related inputs (e.g. companion names)
 *     rather than pointing one label at many controls.
 *
 * Call sites are unchanged, and a child that already has an id keeps it.
 */
export default function Field({ label, required, hint, children }) {
  const labelId   = useId();
  const controlId = useId();

  const kids     = Children.toArray(children);
  const only     = kids.length === 1 && isValidElement(kids[0]) ? kids[0] : null;
  const targetId = only?.props?.id || controlId;

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
        ? cloneElement(only, {
            id: targetId,
            ...(required && only.props["aria-required"] === undefined
              ? { "aria-required": "true" }
              : {}),
          })
        : <div role="group" aria-labelledby={labelId}>{children}</div>}
    </div>
  );
}
