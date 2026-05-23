import styles from "./PageHeader.module.css";

export default function PageHeader({ title, icon, sub, aside }) {
  return (
    <div className={styles.pageHead}>
      <div className={styles.titleWrap}>
        <h2 className={styles.pageTitle}>
          <span className={styles.icon}>{icon}</span> {title}
        </h2>
        {sub && <p className={styles.pageSub}>{sub}</p>}
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </div>
  );
}
