import { useDeferredSelect } from "./useDeferredSelect.js";

/**
 * The seating screen's "which table" <select>, committing on a deliberate
 * choice only — see useDeferredSelect (AX2). `onCommit(value, element)` is
 * called once per real change; everything else is passed to the <select>.
 * `data-seat-select` marks it for refocusAfterRemoval.
 */
export default function SeatSelect({ value, onCommit, children, ...rest }) {
  const deferred = useDeferredSelect(value, onCommit);
  return (
    <select {...rest} {...deferred} data-seat-select="">
      {children}
    </select>
  );
}
