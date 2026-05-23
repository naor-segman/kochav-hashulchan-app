import styles from './App.module.css'

export default function App() {
  return (
    <div className={styles.root}>
      <main className={`container ${styles.main}`}>
        <h1 className={styles.title}>כוכב השולחן ✨</h1>
        <p className={styles.subtitle}>סידור הושבה חכם לאירועים</p>
        <p className="text-muted text-sm">מערכת בפיתוח – שלב אתחול</p>
      </main>
    </div>
  )
}
