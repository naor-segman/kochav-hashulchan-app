import EntranceScreen from "./EntranceScreen.jsx";

/**
 * Compatibility shim — the check-in screen is now עמדת הכניסה.
 *
 * CheckInScreen, HostessScreen and the "מסך כניסה" button on the seating
 * screen were three things occupying the same space, which is what the owner
 * asked about after running a real event. They are one screen now:
 * `EntranceScreen`, in owner mode.
 *
 * This file stays only so `/events/:eventId/checkin` keeps working until
 * App.jsx (owned elsewhere) points at `/events/:eventId/entrance`. Nothing new
 * should be added here.
 */
export default function CheckInScreen(props) {
  return <EntranceScreen mode="owner" {...props} />;
}
