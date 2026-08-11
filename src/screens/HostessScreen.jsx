import EntranceScreen from "./EntranceScreen.jsx";

/**
 * Compatibility shim — the hostess link is now עמדת הכניסה, in token mode.
 *
 * The old screen could only VIEW, so in practice the greeter was handed the
 * owner's account. It now marks arrival too, scoped in SQL to that one write
 * (`hostess_mark_arrival_by_token`) and gated by a switch the host can close
 * after the event.
 *
 * This file stays only so `/hostess/:token` keeps working until App.jsx (owned
 * elsewhere) points at `/entrance/:token`. Nothing new should be added here.
 */
export default function HostessScreen() {
  return <EntranceScreen mode="token" />;
}
