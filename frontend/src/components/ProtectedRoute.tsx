import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ApiError } from "../api/client";
import { useCurrentUser } from "../hooks/useAuth";
import { LoadingScreen } from "./LoadingScreen";

export function ProtectedRoute() {
  const location = useLocation();
  const { data: user, isPending, error } = useCurrentUser();

  if (isPending) return <LoadingScreen />;
  if (!user || (error instanceof ApiError && error.status === 401)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (error) throw error;
  return <Outlet />;
}
