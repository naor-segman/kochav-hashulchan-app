import { supportHref } from "./supportLink.js";

/** The help line inside an auth card — where the floating button is not. */
export default function SupportLine({ className }) {
  const href = supportHref();
  if (!href) return null;
  return (
    <p className={className}>
      נתקעתם?{" "}
      <a href={href} target="_blank" rel="noopener noreferrer">כתבו לנו בוואטסאפ</a>
    </p>
  );
}
