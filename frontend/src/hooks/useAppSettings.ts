import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultAppSettings, getPublicAppSettings, importAddresses, updateAppSettings } from "../api/appSettings";

export const appSettingsKey = ["app-settings"] as const;

export const useAppSettings = () => useQuery({
  queryKey: appSettingsKey,
  queryFn: getPublicAppSettings,
  initialData: defaultAppSettings,
  initialDataUpdatedAt: 0,
  staleTime: 60_000,
  refetchInterval: 60_000,
});

export function useUpdateAppSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateAppSettings,
    onSuccess: (settings) => client.setQueryData(appSettingsKey, settings),
  });
}

export function useAddressImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, crs, commit }: { file: File; crs: "EPSG:25832" | "EPSG:4326"; commit: boolean }) => importAddresses(file, crs, commit),
    onSuccess: (report) => { if (report.committed) client.invalidateQueries({ queryKey: ["map"] }); },
  });
}
