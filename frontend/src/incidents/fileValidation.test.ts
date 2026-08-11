import { maxIncidentFileSize, validateIncidentFile } from "./fileValidation";

describe("validateIncidentFile", () => {
  it("accepterer JPG, PNG og PDF under 10 MiB", () => {
    expect(validateIncidentFile(new File(["pdf"], "rapport.pdf", { type: "application/pdf" }))).toBeNull();
  });

  it("afviser forkert filtype og filer over grænsen", () => {
    expect(validateIncidentFile(new File(["x"], "noter.txt", { type: "text/plain" }))).toMatch(/JPG/);
    const large = new File([new Uint8Array(maxIncidentFileSize + 1)], "foto.jpg", { type: "image/jpeg" });
    expect(validateIncidentFile(large)).toMatch(/10 MiB/);
  });
});
