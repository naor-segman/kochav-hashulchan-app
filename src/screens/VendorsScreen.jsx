import { useMemo, useState } from "react";
import Icon from "../components/ui/Icon.jsx";
import { uid } from "../utils/uid.js";
import {
  VENDOR_STATUSES, VENDOR_CATEGORIES, PAYMENT_STATUSES,
  vendorStatus, vendorCategory, paymentStatus,
  parseAmount, vendorTotals,
} from "../data/vendorConstants.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./VendorsScreen.module.css";

const EMPTY = {
  name: "", category: "venue", status: "lead",
  contact: "", phone: "", price: "", paid: "", payment: "none", note: "",
};

const ils = n => "₪" + Math.round(n).toLocaleString("he-IL");

export default function VendorsScreen({ activeEvent: ev, patchEvent, showToast }) {
  const [form, setForm]     = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("all");

  const vendors = useMemo(() => Array.isArray(ev.vendors) ? ev.vendors : [], [ev.vendors]);
  const totals  = useMemo(() => vendorTotals(vendors), [vendors]);

  const shown = useMemo(() => {
    const list = filter === "all" ? vendors : vendors.filter(v => v.status === filter);
    // Open items first — the ones still needing a phone call are the point.
    const rank = v => (v.status === "booked" ? 2 : v.status === "declined" ? 3 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.name || "").localeCompare(b.name || "", "he"));
  }, [vendors, filter]);

  const write = fn => patchEvent(e => ({ ...e, vendors: fn(Array.isArray(e.vendors) ? e.vendors : []) }));

  const save = () => {
    const name = form.name.trim();
    if (!name) { showToast("שם הספק לא יכול להיות ריק", "err"); return; }
    if (editId) {
      // Only the fields this form actually renders. Spreading the whole `form`
      // wrote back the status it snapshotted when the editor opened, so using
      // the row's own "✓ סגור" button while editing was silently reverted on
      // save — and the toast still said it had worked.
      const { category, contact, phone, price, paid, payment, note } = form;
      write(l => l.map(v => v.id === editId
        ? { ...v, name, category, contact, phone, price, paid, payment, note }
        : v));
      showToast("הספק עודכן ✓");
    } else {
      write(l => [...l, { id: uid(), ...form, name }]);
      showToast("הספק נוסף ✓");
    }
    setForm(EMPTY); setEditId(null); setAdding(false);
  };

  const startEdit = v => {
    setEditId(v.id);
    setForm({ ...EMPTY, ...v });
    setAdding(true);
  };

  const remove = id => {
    const v = vendors.find(x => x.id === id);
    if (!confirm(`למחוק את "${v?.name ?? "הספק"}"?`)) return;
    write(l => l.filter(x => x.id !== id));
    // Deleting the row that is open for editing left the form up; pressing
    // "שמרו" then matched nothing yet still toasted success.
    if (editId === id) { setEditId(null); setAdding(false); setForm(EMPTY); }
    showToast("הספק נמחק");
  };

  const setStatus = (id, status) => write(l => l.map(v => v.id === id ? { ...v, status } : v));

  const waLink = phone => {
    const d = (phone || "").replace(/\D/g, "");
    if (!d) return null;
    return "https://wa.me/" + (d.startsWith("0") ? "972" + d.slice(1) : d);
  };

  return (
    <div className={base.page}>
      <PageHeader
        title="ספקים"
        icon={<Icon name="users" />}
        sub="מי סגור, מי עוד באוויר, וכמה נשאר לשלם."
        aside={
          <div className={base.pills}>
            <StatPill n={totals.booked} label="סגורים" color={totals.booked > 0 ? "var(--green)" : undefined} />
            <StatPill n={totals.open}   label="פתוחים" color={totals.open > 0 ? "var(--warn)" : undefined} />
          </div>
        }
      />

      {vendors.length > 0 && (
        <div className={base.card}>
          <SectionLabel>סיכום</SectionLabel>
          <div className={styles.totals}>
            <div className={styles.total}>
              <span className={styles.totalNum}>{ils(totals.committed)}</span>
              <span className={styles.totalLbl}>סה"כ מחויב</span>
            </div>
            <div className={styles.total}>
              <span className={[styles.totalNum, styles.totalPaid].join(" ")}>{ils(totals.paid)}</span>
              <span className={styles.totalLbl}>שולם</span>
            </div>
            <div className={styles.total}>
              <span className={[styles.totalNum, styles.totalDue].join(" ")}>{ils(totals.remaining)}</span>
              <span className={styles.totalLbl}>נותר לשלם</span>
            </div>
          </div>
          <p className={base.fieldHint}>
            ספקים שסומנו "לא ממשיכים" לא נספרים — אין התחייבות למי שלא נסגר.
          </p>
        </div>
      )}

      <div className={base.card}>
        <div className={styles.toolbar}>
          <button className={base.btnPrimary} onClick={() => { setAdding(true); setEditId(null); setForm(EMPTY); }}>
            ＋ ספק חדש
          </button>
          {vendors.length > 0 && (
            <div className={styles.filters}>
              {[["all", "הכל"], ...VENDOR_STATUSES.map(s => [s.value, s.label])].map(([v, l]) => (
                <button
                  key={v}
                  className={[styles.filterBtn, filter === v ? styles.filterOn : ""].filter(Boolean).join(" ")}
                  onClick={() => setFilter(v)}
                  aria-pressed={filter === v}
                >{l}</button>
              ))}
            </div>
          )}
        </div>

        {adding && (
          <div className={styles.formCard}>
            <SectionLabel>{editId ? "עריכת ספק" : "ספק חדש"}</SectionLabel>
            <div className={base.grid2}>
              <Field label="שם הספק" required>
                <input className={base.input} value={form.name} autoFocus
                  placeholder="למשל: אולמי הגן"
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setAdding(false); }} />
              </Field>
              <Field label="קטגוריה">
                <select className={base.select} value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {VENDOR_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="איש קשר" hint="אופציונלי">
                <input className={base.input} value={form.contact}
                  onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} />
              </Field>
              <Field label="טלפון" hint="אופציונלי">
                <input className={base.input} value={form.phone} placeholder="050-0000000"
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </Field>
              <Field label="סטטוס">
                <select className={base.select} value={form.status}
                  onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {VENDOR_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="מחיר מוסכם" hint="₪ — אופציונלי">
                <input className={base.input} value={form.price} inputMode="numeric"
                  onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              </Field>
              <Field label="שולם עד כה" hint="₪ — אופציונלי">
                <input className={base.input} value={form.paid} inputMode="numeric"
                  onChange={e => setForm(p => ({ ...p, paid: e.target.value }))} />
              </Field>
              <Field label="מצב תשלום">
                <select className={base.select} value={form.payment}
                  onChange={e => setForm(p => ({ ...p, payment: e.target.value }))}>
                  {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="הערה" hint="אופציונלי">
              <input className={base.input} value={form.note} placeholder="מה סוכם, מה נשאר לברר…"
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            </Field>
            <div className={styles.formActions}>
              <button className={base.btnPrimary} onClick={save}>{editId ? "שמרו" : "הוסיפו"}</button>
              <button className={[base.btnSm, base.btnGhost].join(" ")}
                onClick={() => { setAdding(false); setEditId(null); setForm(EMPTY); }}>ביטול</button>
            </div>
          </div>
        )}

        {vendors.length === 0 && !adding && (
          <EmptyState
            icon={<Icon name="users" />}
            title="עדיין לא נוספו ספקים"
            text="הוסיפו את האולם, הצלם, הדיג'יי — וכל מי שאתם עוד בבירור מולו. תוכלו לעקוב מי סגור וכמה נשאר לשלם."
          />
        )}

        {shown.length > 0 && (
          <div className={styles.list}>
            {shown.map(v => {
              const st  = vendorStatus(v.status);
              const pay = paymentStatus(v.payment);
              const due = Math.max(0, parseAmount(v.price) - parseAmount(v.paid));
              const wa  = waLink(v.phone);
              return (
                <div key={v.id} className={[styles.row, v.status === "declined" ? styles.rowOff : ""].filter(Boolean).join(" ")}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTop}>
                      <span className={styles.name}>{v.name}</span>
                      <span className={[styles.tag, styles["tone_" + st.tone]].join(" ")}>{st.label}</span>
                      <span className={styles.cat}>{vendorCategory(v.category).label}</span>
                    </div>
                    {(v.contact || v.phone) && (
                      <div className={styles.rowMeta}>
                        {v.contact}
                        {v.contact && v.phone ? " · " : ""}
                        {wa
                          ? <a href={wa} target="_blank" rel="noopener noreferrer" className={styles.phone}>{v.phone} 📞</a>
                          : v.phone}
                      </div>
                    )}
                    {v.note && <p className={styles.note}>{v.note}</p>}
                  </div>

                  <div className={styles.rowMoney}>
                    {parseAmount(v.price) > 0 && (
                      <>
                        <span className={styles.price}>{ils(parseAmount(v.price))}</span>
                        <span className={[styles.tag, styles["tone_" + pay.tone]].join(" ")}>{pay.label}</span>
                        {due > 0 && v.status !== "declined" && (
                          <span className={styles.due}>נותר {ils(due)}</span>
                        )}
                      </>
                    )}
                  </div>

                  <div className={styles.rowActions}>
                    {v.status !== "booked" && (
                      <button className={styles.actBtn} onClick={() => setStatus(v.id, "booked")}>✓ סגור</button>
                    )}
                    <button className={styles.iconBtn} onClick={() => startEdit(v)} aria-label="עריכה">✎</button>
                    <button className={styles.iconBtn} onClick={() => remove(v.id)} aria-label="מחיקה">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {vendors.length > 0 && shown.length === 0 && (
          <p className={styles.noMatch}>אין ספקים בסטטוס הזה.</p>
        )}
      </div>
    </div>
  );
}
