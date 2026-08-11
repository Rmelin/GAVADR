import { Navigate, Outlet } from "react-router-dom";
import { ApiError } from "../api/client";
import { useCurrentUser } from "../hooks/useAuth";
import { LoadingScreen } from "./LoadingScreen";

export function AdminRoute() {
  const { data: user, isPending, error } = useCurrentUser();
  if (isPending) return <LoadingScreen />;
  if (error instanceof ApiError && error.status === 401) return <Navigate to="/login" replace />;
  if (error) throw error;
  if (!user?.roles.includes("admin")) return <Navigate to="/" replace />;
  return <Outlet />;
}
