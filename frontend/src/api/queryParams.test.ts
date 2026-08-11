import { listParams } from "./queryParams";

it("serialiserer listefiltre som gentagne parametre", () => {
  expect(listParams({ status: ["new", "active"], priority: "high" }).toString()).toBe("status=new&status=active&priority=high");
});

it("udelader tomme arrays og værdier", () => {
  expect(listParams({ status: [], priority: "", mine: undefined }).toString()).toBe("");
});
