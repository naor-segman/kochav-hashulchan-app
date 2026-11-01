import styles from "./ProductShot.module.css";
import { PHONE_SHOTS } from "../../data/phoneShots.js";

/* A product screenshot on a service page, with its phone-width twin (1.11).
 *
 * The desktop shots are 1200px screens; in a 358px phone column they were
 * unreadable (design review 4.10). Under 600px the browser takes the phone
 * frame instead — the same screen captured at 390px from the same seeded
 * wedding (qa/marketingShotsPhone.mjs, frames with dir "page"). A shot with no
 * phone twin (the guest-facing gift form and wall) stays a plain <img>.
 * <source> carries its own width and height so the box is the right shape
 * before the image arrives — no layout shift at either size. */

export default function ProductShot({ src, ...img }) {
  const name = /^\/shots\/([\w-]+)\.jpg$/.exec(src || "")?.[1];
  if (!name || !PHONE_SHOTS.includes(name)) return <img src={src} {...img} />;
  return (
    <picture className={styles.pic}>
      <source media="(max-width: 599px)" srcSet={`/shots-phone/page/${name}.jpg`} width="780" height="1200" />
      <img src={src} {...img} />
    </picture>
  );
}
