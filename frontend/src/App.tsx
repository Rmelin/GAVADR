import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { RoleRoute } from "./components/RoleRoute";
import { LoadingScreen } from "./components/LoadingScreen";
import { ThemeProvider } from "./components/ThemeProvider";
import { AppShell } from "./layouts/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { UsersPage } from "./pages/UsersPage";
import { InquiriesPage } from "./pages/InquiriesPage";
import { InquiryDetailPage } from "./pages/InquiryDetailPage";
import { MapCorrectionsPage } from "./pages/MapCorrectionsPage";
import { MapCorrectionDetailPage } from "./pages/MapCorrectionDetailPage";
import { TasksPage } from "./pages/TasksPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { IncidentDetailPage } from "./pages/IncidentDetailPage";
import { PlannedShutdownsPage } from "./pages/PlannedShutdownsPage";
import { PlannedShutdownDetailPage } from "./pages/PlannedShutdownDetailPage";
import { PublicDriftPage } from "./pages/PublicDriftPage";
import { createQueryClient } from "./queryClient";

const MapPage = lazy(() => import("./pages/MapPage").then((module) => ({ default: module.MapPage })));
const CreateIncidentPage = lazy(() => import("./pages/CreateIncidentPage").then((module) => ({ default: module.CreateIncidentPage })));
const CreatePlannedShutdownPage = lazy(() => import("./pages/CreatePlannedShutdownPage").then((module) => ({ default: module.CreatePlannedShutdownPage })));
const CreateInquiryPage = lazy(() => import("./pages/CreateInquiryPage").then((module) => ({ default: module.CreateInquiryPage })));
const CreateMapCorrectionPage = lazy(() => import("./pages/CreateMapCorrectionPage").then((module) => ({ default: module.CreateMapCorrectionPage })));
const CreateTaskPage = lazy(() => import("./pages/CreateTaskPage").then((module) => ({ default: module.CreateTaskPage })));
const AppSettingsPage = lazy(() => import("./pages/AppSettingsPage").then((module) => ({ default: module.AppSettingsPage })));
const ClosureScenariosPage = lazy(() => import("./pages/ClosureScenariosPage").then((module) => ({ default: module.ClosureScenariosPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));

const queryClient = createQueryClient();
const router = createBrowserRouter([
  { path: "/drift", element: <PublicDriftPage /> },
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [{ element: <AppShell />, children: [
      { index: true, element: <DashboardPage /> },
      { path: "kort", element: <Suspense fallback={<LoadingScreen />}><MapPage /></Suspense> },
      { element: <RoleRoute allowedRoles={["admin", "map_manager"]} />, children: [{ path: "lukkescenarier", element: <Suspense fallback={<LoadingScreen />}><ClosureScenariosPage /></Suspense> }] },
      { path: "haendelser", element: <IncidentsPage /> },
      { path: "haendelser/ny", element: <Suspense fallback={<LoadingScreen />}><CreateIncidentPage /></Suspense> },
      { path: "haendelser/:incidentId", element: <IncidentDetailPage /> },
      { path: "vandlukninger", element: <PlannedShutdownsPage /> },
      { path: "vandlukninger/ny", element: <Suspense fallback={<LoadingScreen />}><CreatePlannedShutdownPage /></Suspense> },
      { path: "vandlukninger/:shutdownId", element: <PlannedShutdownDetailPage /> },
      { path: "historik", element: <Suspense fallback={<LoadingScreen />}><HistoryPage /></Suspense> },
      { path: "henvendelser", element: <InquiriesPage /> },
      { path: "henvendelser/ny", element: <Suspense fallback={<LoadingScreen />}><CreateInquiryPage /></Suspense> },
      { path: "henvendelser/:inquiryId", element: <InquiryDetailPage /> },
      { path: "kortrettelser", element: <MapCorrectionsPage /> },
      { path: "kortrettelser/ny", element: <Suspense fallback={<LoadingScreen />}><CreateMapCorrectionPage /></Suspense> },
      { path: "kortrettelser/:correctionId", element: <MapCorrectionDetailPage /> },
      { path: "opgaver", element: <TasksPage /> },
      { path: "opgaver/ny", element: <Suspense fallback={<LoadingScreen />}><CreateTaskPage /></Suspense> },
      { path: "opgaver/:taskId", element: <TaskDetailPage /> },
      { element: <AdminRoute />, children: [{ path: "brugere", element: <UsersPage /> }, { path: "indstillinger", element: <Suspense fallback={<LoadingScreen />}><AppSettingsPage /></Suspense> }] },
    ] }],
  },
  { path: "*", element: <NotFoundPage /> },
]);

export function App() {
  return <ThemeProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></ThemeProvider>;
}
