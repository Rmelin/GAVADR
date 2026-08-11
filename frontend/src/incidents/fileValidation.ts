const allowedTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
export const maxIncidentFileSize = 10 * 1024 * 1024;

export function validateIncidentFile(file: File): string | null {
  if (!allowedTypes.has(file.type)) return "Vælg en JPG-, PNG- eller PDF-fil.";
  if (file.size > maxIncidentFileSize) return "Filen må højst fylde 10 MiB.";
  return null;
}
