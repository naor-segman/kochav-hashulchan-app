import { useState, useEffect, useCallback, useRef } from "react";
import { loadState, persist } from "./utils/storage.js";
import { uid } from "./utils/uid.js";
import Shell from "./components/layout/Shell.jsx";
import Toast from "./components/feedback/Toast.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import EventSetupScreen from "./screens/EventSetupScreen.jsx";
import TableBuilderScreen from "./screens/TableBuilderScreen.jsx";
import GuestManagerScreen from "./screens/GuestManagerScreen.jsx";
import ConstraintsScreen from "./screens/ConstraintsScreen.jsx";
import SeatingScreen from "./screens/SeatingScreen.jsx";

export default function App() {
  const [events, setEvents]               = useState([]);
  const [activeEventId, setActiveEventId] = useState(null);
  const [screen, setScreen]               = useState("dashboard");
  const [toast, setToast]                 = useState(null);
  const toastTimer                        = useRef(null);

  useEffect(() => { const s = loadState(); setEvents(s.events || []); }, []);
  useEffect(() => { persist({ events }); }, [events]);

  const showToast = (msg, variant) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, variant: variant || "ok" });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const activeEvent = events.find(e => e.id === activeEventId) || null;

  const patchEvent = useCallback((patch) => {
    setEvents(prev => prev.map(e =>
      e.id === activeEventId
        ? (typeof patch === "function" ? patch(e) : Object.assign({}, e, patch))
        : e
    ));
  }, [activeEventId]);

  const go = (s, eventId) => {
    if (eventId !== undefined) setActiveEventId(eventId);
    setScreen(s);
    window.scrollTo(0, 0);
  };

  const createEvent = () => {
    const ev = {
      id: uid(), name: "", type: "חתונה", date: "", venue: "",
      brideName: "", groomName: "",
      tables: [], guests: [], seating: {}, constraints: [],
      createdAt: Date.now(),
    };
    setEvents(prev => [ev, ...prev]);
    go("setup", ev.id);
  };

  const deleteEvent = (id) => {
    if (!confirm("למחוק את האירוע לצמיתות? לא ניתן לשחזר.")) return;
    setEvents(prev => prev.filter(e => e.id !== id));
    if (activeEventId === id) { setActiveEventId(null); setScreen("dashboard"); }
    showToast("האירוע נמחק");
  };

  const sp = { activeEvent, patchEvent, go, showToast };

  return (
    <Shell screen={screen} activeEvent={activeEvent} go={go}>
      {screen === "dashboard"   && <DashboardScreen events={events} onCreateEvent={createEvent} onOpenEvent={id => go("setup", id)} onDeleteEvent={deleteEvent} />}
      {screen === "setup"       && activeEvent && <EventSetupScreen       {...sp} />}
      {screen === "tables"      && activeEvent && <TableBuilderScreen      {...sp} />}
      {screen === "guests"      && activeEvent && <GuestManagerScreen      {...sp} />}
      {screen === "constraints" && activeEvent && <ConstraintsScreen       {...sp} />}
      {screen === "seating"     && activeEvent && <SeatingScreen           {...sp} />}
      {toast && <Toast msg={toast.msg} variant={toast.variant} />}
    </Shell>
  );
}
