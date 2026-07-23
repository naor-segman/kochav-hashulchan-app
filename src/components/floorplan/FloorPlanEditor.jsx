import { useState, useRef, useCallback } from "react";
import Icon from "../ui/Icon.jsx";
import {
  DndContext, DragOverlay,
  useDraggable, useDroppable,
  PointerSensor, TouchSensor,
  useSensor, useSensors,
} from "@dnd-kit/core";
import { supabase, isSupabaseConfigured } from "../../lib/supabase.js";
import { uid } from "../../utils/uid.js";
import styles from "./FloorPlanEditor.module.css";

// AI table-detection needs the `detect-floor-plan` Edge Function deployed.
// Disabled until that function is live so the button can never error out.
// Flip to true once the function is deployed (Enterprise feature).
const ENABLE_AI_DETECT = false;

// ── Image helpers ────────────────────────────────────────────────────────────

async function compressImage(file, maxPx = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        let { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, maxPx / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

// ── DnD sub-components ───────────────────────────────────────────────────────

function DraggableGuestPill({ guest, tableId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   guest.id,
    data: { type: "guest", guestId: guest.id, fromTableId: tableId },
  });
  return (
    <span
      ref={setNodeRef}
      className={[styles.guestPill, isDragging ? styles.dragging : ""].filter(Boolean).join(" ")}
      {...attributes}
      {...listeners}
    >
      {guest.name}
      {(guest.count || 1) > 1 && <span className={styles.pillCount}>×{guest.count}</span>}
    </span>
  );
}

function TableChipOnImage({ table, guests }) {
  const seated = guests.reduce((s, g) => s + (g.count || 1), 0);
  const pct    = table.capacity > 0 ? seated / table.capacity : 0;

  const {
    attributes: dragAttrs,
    listeners:  dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: "chip-" + table.id, data: { type: "chip", tableId: table.id } });

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: "chip-" + table.id });

  const mergedRef = useCallback((node) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  return (
    <div
      ref={mergedRef}
      className={[
        styles.tableChip,
        isDragging ? styles.chipDragging : "",
        isOver     ? styles.chipOver     : "",
      ].filter(Boolean).join(" ")}
      onClick={e => e.stopPropagation()}
    >
      <div className={styles.chipHandle} {...dragAttrs} {...dragListeners}>
        ⠿ {table.name}
        <span className={[
          styles.chipCap,
          pct > 1        ? styles.capOver  : "",
          pct > 0.85 && pct <= 1 ? styles.capWarn : "",
        ].filter(Boolean).join(" ")}>
          {seated}/{table.capacity}
        </span>
      </div>
      <div className={styles.chipGuests}>
        {guests.length === 0
          ? <span className={styles.chipEmpty}>ריק</span>
          : guests.slice(0, 6).map(g => (
              <DraggableGuestPill key={g.id} guest={g} tableId={table.id} />
            ))
        }
        {guests.length > 6 && (
          <span className={styles.chipEmpty}>+{guests.length - 6} עוד</span>
        )}
      </div>
    </div>
  );
}

function UploadZone({ onClick, onDrop }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={[styles.uploadZone, dragging ? styles.uploadZoneDragging : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onDrop(file);
      }}
    >
      <div className={styles.uploadIcon}><Icon name="building" size={32} /></div>
      <div className={styles.uploadTitle}>העלו סקיצת אולם</div>
      <div className={styles.uploadHint}>
        לחצו לבחירת קובץ תמונה, או גררו לכאן<br />
        (JPG, PNG — התמונה נשמרת במכשיר שלכם בלבד)
      </div>
    </div>
  );
}

function UnassignedPanel({ guests }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned" });
  return (
    <div
      ref={setNodeRef}
      className={[styles.unassignedPanel, isOver ? styles.panelOver : ""].filter(Boolean).join(" ")}
    >
      <div className={styles.panelLabel}>לא משובצים ({guests.length})</div>
      <div className={styles.panelGuests}>
        {guests.map(g => <DraggableGuestPill key={g.id} guest={g} tableId={null} />)}
        {guests.length === 0 && <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>כולם משובצים ✓</span>}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function FloorPlanEditor({ ev, patchEvent, showToast }) {
  const [placingId,  setPlacingId]  = useState(null);
  const [detecting,  setDetecting]  = useState(false);
  const [detResult,  setDetResult]  = useState(null);
  const [activeId,   setActiveId]   = useState(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const floorPlan  = ev.floorPlan ?? { image: null, tablePositions: {} };
  const hasImage   = !!floorPlan.image;
  const positions  = floorPlan.tablePositions ?? {};
  const placedIds  = new Set(Object.keys(positions));
  const unplaced   = ev.tables.filter(t => !placedIds.has(t.id));
  const unassigned = ev.guests.filter(g => !ev.seating[g.id] && g.rsvp !== "declined");

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      showToast("יש לבחור קובץ תמונה (JPG, PNG)", "err");
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      patchEvent(e => ({
        ...e,
        floorPlan: { image: dataUrl, tablePositions: e.floorPlan?.tablePositions ?? {} },
      }));
      showToast("הסקיצה הועלתה בהצלחה ✓");
    } catch {
      showToast("שגיאה בעיבוד התמונה", "err");
    }
  };

  // ── AI detection ──────────────────────────────────────────────────────────

  const handleDetect = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showToast("זיהוי אוטומטי דורש חיבור לענן (Supabase)", "err");
      return;
    }
    const [, base64] = (floorPlan.image || "").split(",");
    if (!base64) return;
    setDetecting(true);
    setDetResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("detect-floor-plan", {
        body: { imageBase64: base64, mimeType: "image/jpeg" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.tables?.length) {
        showToast("לא זוהו שולחנות. נסו תמונה ברורה יותר.", "warn");
        return;
      }
      setDetResult(data);
    } catch (err) {
      showToast("שגיאה בזיהוי: " + (err.message || String(err)), "err");
    } finally {
      setDetecting(false);
    }
  };

  const handleConfirmDetection = () => {
    const snapshot = detResult; // capture before async state clear
    // Pre-generate IDs so positions map can reference them before patchEvent runs
    const newIds = snapshot.tables.map(() => uid());

    patchEvent(e => {
      const baseIdx   = e.tables.length;
      const newTables = snapshot.tables.map((det, i) => ({
        id:       newIds[i],
        name:     "שולחן " + (baseIdx + i + 1),
        capacity: det.seats || 8,
        type:     "regular",
      }));
      // Merge into fresh positions so any drags done since detection are kept.
      const freshPositions = { ...(e.floorPlan?.tablePositions ?? {}) };
      snapshot.tables.forEach((det, i) => {
        freshPositions[newIds[i]] = {
          x: Math.min(0.94, Math.max(0.06, det.x / 100)),
          y: Math.min(0.94, Math.max(0.06, det.y / 100)),
        };
      });
      return {
        ...e,
        tables:    e.tables.concat(newTables),
        floorPlan: { ...e.floorPlan, tablePositions: freshPositions },
      };
    });
    setDetResult(null);
    showToast("נוספו " + snapshot.tables.length + " שולחנות מהסקיצה ✓");
  };

  // ── Place table on image by clicking ─────────────────────────────────────

  const handleImageClick = (e) => {
    if (!placingId) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top)  / rect.height;
    patchEvent(ev => ({
      ...ev,
      floorPlan: {
        ...ev.floorPlan,
        tablePositions: {
          ...ev.floorPlan?.tablePositions,
          [placingId]: {
            x: Math.min(0.94, Math.max(0.06, x)),
            y: Math.min(0.94, Math.max(0.06, y)),
          },
        },
      },
    }));
    setPlacingId(null);
    const t = ev.tables.find(t => t.id === placingId);
    showToast("\"" + (t?.name ?? "שולחן") + "\" מוקם על הסקיצה ✓");
  };

  // ── DnD ───────────────────────────────────────────────────────────────────

  const handleDragStart  = ({ active }) => setActiveId(active.id);
  const handleDragCancel = () => setActiveId(null);

  const handleDragEnd = ({ active, over, delta }) => {
    setActiveId(null);
    if (!active?.data?.current) return;
    const { type } = active.data.current;

    if (type === "chip") {
      // Reposition chip: apply delta relative to container size.
      // cur is read INSIDE patchEvent so we always use the latest committed
      // position, not a render-time snapshot that may have been stale.
      const { tableId } = active.data.current;
      const container = containerRef.current;
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();
      patchEvent(e => {
        const cur = e.floorPlan?.tablePositions?.[tableId] ?? { x: 0.5, y: 0.5 };
        return {
          ...e,
          floorPlan: {
            ...e.floorPlan,
            tablePositions: {
              ...e.floorPlan?.tablePositions,
              [tableId]: {
                x: Math.min(0.94, Math.max(0.06, cur.x + delta.x / width)),
                y: Math.min(0.94, Math.max(0.06, cur.y + delta.y / height)),
              },
            },
          },
        };
      });
      return;
    }

    if (type === "guest") {
      if (!over) return;
      const { guestId, fromTableId } = active.data.current;
      const toTableId = over.id === "unassigned" ? null
        : over.id.startsWith("chip-")           ? over.id.slice(5)
        : null;
      if (toTableId === fromTableId) return;
      patchEvent(e => ({
        ...e,
        seating: toTableId
          ? { ...e.seating, [guestId]: toTableId }
          : Object.fromEntries(Object.entries(e.seating).filter(([id]) => id !== guestId)),
      }));
    }
  };

  // Drag overlay content
  const activeGuest = activeId && !activeId.startsWith("chip-")
    ? ev.guests.find(g => g.id === activeId) : null;
  const activeTable = activeId?.startsWith("chip-")
    ? ev.tables.find(t => t.id === activeId.slice(5)) : null;

  // ── No image: show upload zone ────────────────────────────────────────────

  if (!hasImage) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
        />
        <UploadZone
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleFile}
        />
      </>
    );
  }

  // ── Has image: show floor plan editor ─────────────────────────────────────

  const placingTableName = placingId ? (ev.tables.find(t => t.id === placingId)?.name ?? "") : "";

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
      />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={() => fileInputRef.current?.click()}>
          החליפו תמונה
        </button>
        {ENABLE_AI_DETECT && (
          <button
            className={styles.toolBtnPrimary}
            onClick={handleDetect}
            disabled={detecting || !isSupabaseConfigured}
            title={!isSupabaseConfigured ? "זיהוי אוטומטי דורש חיבור לענן" : undefined}
          >
            {detecting ? "מזהה..." : <><Icon name="sparkle" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />זיהוי שולחנות אוטומטי</>}
          </button>
        )}
        {placingId && (
          <span className={styles.toolHint}>
            לחצו על הסקיצה למקם את &ldquo;{placingTableName}&rdquo;
            <button className={styles.cancelPlace} onClick={() => setPlacingId(null)}>✕</button>
          </span>
        )}
      </div>

      {/* Detection result */}
      {ENABLE_AI_DETECT && detResult && (
        <div className={styles.detectionCard}>
          <div className={styles.detTitle}><Icon name="sparkle" size={16} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />זוהו {detResult.totalDetected} שולחנות בסקיצה</div>
          {detResult.note && <p className={styles.detNote}>{detResult.note}</p>}
          <div className={styles.detList}>
            {detResult.tables.map((t, i) => (
              <span key={i} className={styles.detPill}>{i + 1}: {t.seats} כיסאות</span>
            ))}
          </div>
          <div className={styles.detActions}>
            <button className={styles.toolBtnPrimary} onClick={handleConfirmDetection}>
              ✓ הוסיפו {detResult.tables.length} שולחנות
            </button>
            <button className={styles.toolBtn} onClick={() => setDetResult(null)}>בטלו</button>
          </div>
        </div>
      )}

      {/* Floor plan image with table chips */}
      <div
        className={[styles.imageContainer, placingId ? styles.placingMode : ""].filter(Boolean).join(" ")}
        ref={containerRef}
        onClick={handleImageClick}
      >
        <img
          className={styles.floorImage}
          src={floorPlan.image}
          alt="מפת אולם"
          draggable={false}
        />

        {ev.tables
          .filter(t => positions[t.id])
          .map(table => {
            const pos    = positions[table.id];
            const guests = ev.guests.filter(g => ev.seating[g.id] === table.id);
            return (
              <div
                key={table.id}
                style={{ position: "absolute", left: pos.x * 100 + "%", top: pos.y * 100 + "%" }}
              >
                <TableChipOnImage table={table} guests={guests} />
              </div>
            );
          })}
      </div>

      {/* Unplaced tables strip */}
      {unplaced.length > 0 && (
        <div className={styles.unplacedStrip}>
          <div className={styles.unplacedLabel}>
            {unplaced.length === ev.tables.length
              ? "בחרו שולחן ולחצו על הסקיצה כדי למקם אותו:"
              : unplaced.length + " שולחנות טרם מוקמו — בחרו ולחצו על הסקיצה:"}
          </div>
          <div className={styles.unplacedList}>
            {unplaced.map(t => (
              <button
                key={t.id}
                className={[styles.unplacedBtn, placingId === t.id ? styles.unplacedBtnActive : ""].filter(Boolean).join(" ")}
                onClick={e => { e.stopPropagation(); setPlacingId(placingId === t.id ? null : t.id); }}
              >
                ⬡ {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unassigned guests droppable panel */}
      {(unassigned.length > 0 || ev.guests.length > 0) && (
        <UnassignedPanel guests={unassigned} />
      )}

      {/* Drag overlay */}
      <DragOverlay>
        {activeGuest && (
          <span className={[styles.guestPill, styles.overlayPill].join(" ")}>
            {activeGuest.name}
            {(activeGuest.count || 1) > 1 && (
              <span className={styles.pillCount}>×{activeGuest.count}</span>
            )}
          </span>
        )}
        {activeTable && (
          <div className={[styles.tableChip, styles.overlayChip].join(" ")}>
            <div className={styles.chipHandle}>⠿ {activeTable.name}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
