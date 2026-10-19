import { Navigate } from "react-router-dom";

/* "/" for everyone: the landing page for a visitor, the app for someone signed
 * in, nothing while the session is still being read (so a signed-in host does
 * not see the landing page flash first). Its own component so the redirect can
 * be tested — checklist 3 noted it was never checked (no session here). */
export default function RootGate({ user, loading, children }) {
  if (loading) return <div />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}
