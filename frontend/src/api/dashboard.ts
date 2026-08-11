import { apiRequest } from "./client";
import type { MapFeatureCollection } from "../types/map";

export const getDashboardMap = () => apiRequest<MapFeatureCollection>("/dashboard/map");
