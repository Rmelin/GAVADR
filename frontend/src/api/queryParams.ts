export type ListFilters = Record<string, string | string[] | undefined>;

export function listParams(filters: ListFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([name, value]) => {
    if (Array.isArray(value)) value.filter(Boolean).forEach((item) => params.append(name, item));
    else if (value) params.set(name, value);
  });
  return params;
}
