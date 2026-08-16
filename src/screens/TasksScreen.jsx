import { useMemo, useState } from "react";
import Icon from "../components/ui/Icon.jsx";
import { uid } from "../utils/uid.js";
import { fmtDate } from "../utils/dateFormat.js";
import { TASK_PRIORITIES, TASK_STATUSES, starterTasks, seedTaskDue, localISODate } from "../data/taskTemplates.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./TasksScreen.module.css";

const EMPTY = { title: "", note: "", due: "", priority: "normal" };
// toISOString() gives the UTC date, so between local midnight and 03:00 in
// Israel a task due yesterday was neither counted as overdue nor flagged.
const todayISO = () => localISODate();

export default function TasksScreen({ activeEvent: ev, patchEvent, showToast }) {
  const { confirm, dialog } = useConfirm();
  const [form,   setForm]   = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [adding, setAdding] = useState(false);

  const tasks = useMemo(() => Array.isArray(ev.tasks) ? ev.tasks : [], [ev.tasks]);

  const byStatus = useMemo(() => {
    const groups = { todo: [], doing: [], done: [] };
    for (const t of tasks) (groups[t.status] || groups.todo).push(t);
    // Undated tasks sink below dated ones instead of sorting as "very early".
    const rank = t => (t.due ? t.due : "9999-12-31");
    for (const k of Object.keys(groups)) groups[k].sort((a, b) => rank(a).localeCompare(rank(b)));
    return groups;
  }, [tasks]);

  const done      = byStatus.done.length;
  const open      = tasks.length - done;
  const overdue   = tasks.filter(t => t.status !== "done" && t.due && t.due < todayISO()).length;

  const write = (fn) => patchEvent(e => ({ ...e, tasks: fn(Array.isArray(e.tasks) ? e.tasks : []) }));

  const saveForm = () => {
    const title = form.title.trim();
    if (!title) { showToast("שם המשימה לא יכול להיות ריק", "err"); return; }
    if (editId) {
      write(list => list.map(t => t.id === editId ? { ...t, ...form, title } : t));
      showToast("המשימה עודכנה ✓");
    } else {
      write(list => [...list, { id: uid(), ...form, title, status: "todo", doneAt: null }]);
      showToast("המשימה נוספה ✓");
    }
    setForm(EMPTY); setEditId(null); setAdding(false);
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setForm({ title: t.title, note: t.note || "", due: t.due || "", priority: t.priority || "normal" });
    setAdding(true);
  };

  const move = (id, status) =>
    write(list => list.map(t => t.id === id
      ? { ...t, status, doneAt: status === "done" ? Date.now() : null }
      : t));

  const remove = async (id) => {
    const t = tasks.find(x => x.id === id);
    if (!await confirm(`למחוק את "${t?.title ?? "המשימה"}"?`, { danger: true, confirmLabel: "מחקו" })) return;
    write(list => list.filter(x => x.id !== id));
    // Same as vendors: clear the open editor, or "שמרו" writes nothing and
    // still reports success.
    if (editId === id) { setEditId(null); setAdding(false); setForm(EMPTY); }
    showToast("המשימה נמחקה");
  };

  const loadStarter = () => {
    const rows = starterTasks(ev.type).map(r => ({
      id: uid(),
      title: r.title,
      note: "",
      due: seedTaskDue(ev.date, r.offset),
      priority: r.priority,
      status: "todo",
      doneAt: null,
    }));
    write(list => [...list, ...rows]);
    showToast(rows.length + " משימות נוספו — ערכו או מחקו לפי הצורך ✓");
  };

  return (
    <div className={base.page}>
      {dialog}
      <PageHeader
        title="לוח משימות"
        mark="tasks"
        sub="כל מה שצריך לסגור לפני האירוע, במקום אחד."
        aside={
          <div className={base.pills}>
            <StatPill n={open} label="פתוחות" primary />
            <StatPill n={done} label="הושלמו" color={done > 0 ? "var(--green)" : undefined} />
            {overdue > 0 && <StatPill n={overdue} label="באיחור" color="var(--red)" />}
          </div>
        }
      />

      <div className={base.card}>
        <div className={styles.toolbar}>
          <button className={base.btnPrimary} onClick={() => { setAdding(true); setEditId(null); setForm(EMPTY); }}>
            <Icon name="plus" size={15} /> משימה חדשה
          </button>
          {tasks.length === 0 && (
            <button className={base.btnSm} onClick={loadStarter}>
              טענו רשימת התחלה ל{ev.type && ev.type !== "אחר" ? ev.type : "אירוע"}
            </button>
          )}
          {done > 0 && (
            <button
              className={[base.btnSm, base.btnGhost].join(" ")}
              onClick={async () => {
                if (!await confirm(`למחוק ${done} משימות שהושלמו?`, { danger: true, confirmLabel: "מחקו" })) return;
                write(list => list.filter(t => t.status !== "done"));
                showToast("המשימות שהושלמו נמחקו");
              }}
            >
              נקו הושלמו ({done})
            </button>
          )}
        </div>

        {adding && (
          <div className={styles.formCard}>
            <SectionLabel>{editId ? "עריכת משימה" : "משימה חדשה"}</SectionLabel>
            <div className={base.grid2}>
              <Field label="מה צריך לעשות" required>
                <input
                  className={base.input}
                  value={form.title}
                  autoFocus
                  placeholder="למשל: לסגור מספר מנות מול האולם"
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") saveForm(); if (e.key === "Escape") { setAdding(false); setEditId(null); } }}
                />
              </Field>
              <Field label="תאריך יעד" hint="אופציונלי">
                <input className={base.input} type="date" value={form.due}
                  onChange={e => setForm(p => ({ ...p, due: e.target.value }))} />
              </Field>
              <Field label="עדיפות">
                <select className={base.select} value={form.priority}
                  onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                  {TASK_PRIORITIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="הערה" hint="אופציונלי">
                <input className={base.input} value={form.note} placeholder="פרטים, מספר טלפון, סכום…"
                  onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
              </Field>
            </div>
            <div className={styles.formActions}>
              <button className={base.btnPrimary} onClick={saveForm}>{editId ? "שמרו" : "הוסיפו"}</button>
              <button className={[base.btnSm, base.btnGhost].join(" ")}
                onClick={() => { setAdding(false); setEditId(null); setForm(EMPTY); }}>ביטול</button>
            </div>
          </div>
        )}

        {tasks.length === 0 && !adding && (
          <EmptyState
            mark="tasks"
            title="אין עדיין משימות"
            text="הוסיפו משימה ראשונה, או טענו רשימת התחלה מותאמת לסוג האירוע ותערכו אותה."
          />
        )}

        {tasks.length > 0 && (
          <div className={styles.board}>
            {TASK_STATUSES.map(col => (
              <div key={col.value} className={styles.column} data-state={col.value}>
                <div className={styles.colHead}>
                  {col.label}
                  <span
                    className={styles.colCount}
                    data-empty={byStatus[col.value].length === 0 ? "1" : undefined}
                  >
                    {byStatus[col.value].length}
                  </span>
                </div>

                {byStatus[col.value].length === 0 && (
                  <p className={styles.colEmpty}>אין משימות</p>
                )}

                {byStatus[col.value].map(t => {
                  const late = t.status !== "done" && t.due && t.due < todayISO();
                  return (
                    <div key={t.id} className={[styles.task, t.status === "done" ? styles.taskDone : ""].filter(Boolean).join(" ")}>
                      <div className={styles.taskTop}>
                        <span className={[styles.prio, styles["prio_" + (t.priority || "normal")]].join(" ")} />
                        <span className={styles.taskTitle}>{t.title}</span>
                      </div>

                      {t.note && <p className={styles.taskNote}>{t.note}</p>}

                      {t.due && (
                        <span className={[styles.due, late ? styles.dueLate : ""].filter(Boolean).join(" ")}>
                          {late ? "באיחור · " : ""}{fmtDate(t.due)}
                        </span>
                      )}

                      <div className={styles.taskActions}>
                        {TASK_STATUSES.filter(s => s.value !== t.status).map(s => (
                          <button key={s.value} className={styles.moveBtn} onClick={() => move(t.id, s.value)}>
                            {s.value === "done"
                              ? <><Icon name="check" size={13} /> הושלם</>
                              : <><Icon name="arrowLeft" size={13} /> {s.label}</>}
                          </button>
                        ))}
                        {/* Their own element so the touch stylesheet can give them
                            a line of their own — see .taskIcons. On a mouse this
                            is a plain flex child and changes nothing. */}
                        <div className={styles.taskIcons}>
                          <button className={styles.iconBtn} onClick={() => startEdit(t)} aria-label="עריכה"><Icon name="edit" size={15} /></button>
                          <button className={styles.iconBtn} onClick={() => remove(t.id)} aria-label="מחיקה"><Icon name="close" size={15} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
