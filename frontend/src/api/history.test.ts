import { historyCsvUrl, historyParams } from "./history";
import type { HistoryFilters } from "../types/history";

it("serialiserer historikfiltre ens til liste og eksport", () => {
  const filters: HistoryFilters = { from: "2026-01-01", to: "2026-08-11", category: ["break", "other_incident"], location: " Åvej ", page: 2, page_size: 25 };
  expect(historyParams(filters).toString()).toBe("from=2026-01-01&to=2026-08-11&category=break&category=other_incident&location=%C3%85vej&page=2&page_size=25");
  expect(historyCsvUrl(filters)).toBe("/api/history/export.csv?from=2026-01-01&to=2026-08-11&category=break&category=other_incident&location=%C3%85vej");
});
