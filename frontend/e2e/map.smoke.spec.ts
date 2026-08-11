import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "e2e-user",
  email: "drift@example.dk",
  display_name: "Browser Smoke",
  roles: ["board_member", "map_manager"],
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const emptyFeatures = { type: "FeatureCollection", features: [] };

async function mockAuthenticatedApi(page: Page) {
  let authenticated = false;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/login") {
      authenticated = true;
      return route.fulfill({ json: { access_token: "e2e", token_type: "bearer", expires_in: 1800 } });
    }
    if (url.pathname === "/api/auth/me") {
      return authenticated
        ? route.fulfill({ json: user })
        : route.fulfill({ status: 401, json: { detail: "Not authenticated" } });
    }
    if (["/api/addresses", "/api/valves", "/api/pipes", "/api/closure-areas"].includes(url.pathname)) {
      return route.fulfill({ json: emptyFeatures });
    }
    if (url.pathname === "/api/dashboard/map") return route.fulfill({ json: emptyFeatures });
    if (url.pathname === "/api/history") return route.fulfill({ json: { items: [], summary: { total: 0, breaks: 0, shutdowns: 0, excavations: 0, other_incidents: 0 }, page: 1, page_size: 25, total_pages: 0 } });
    if (url.pathname === "/api/closure-scenarios") return route.fulfill({ json: [] });
    if (url.pathname === "/api/audit-logs") return route.fulfill({ json: [] });
    if (url.pathname === "/api/public/driftsstatus") {
      return route.fulfill({ json: { updated_at: null, status: "normal_drift", items: [] } });
    }
    if (url.pathname === "/api/app-settings/public") {
      return route.fulfill({ json: { organization_name: "GAVAD", organization_address: "", organization_locality: "", map_default_longitude: 11.45, map_default_latitude: 55.62, map_default_zoom: 13, updated_at: null } });
    }
    if (url.pathname === "/api/users/options") return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { detail: "Unhandled E2E API request" } });
  });
}

async function expectMapFillsStage(page: Page, containerSelector: string, stageSelector: string) {
  const container = page.locator(containerSelector);
  const stage = page.locator(stageSelector);
  const canvas = container.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();

  await expect.poll(async () => {
    const [stageSize, canvasBox] = await Promise.all([
      stage.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight })),
      canvas.boundingBox(),
    ]);
    if (!canvasBox) return false;
    return Math.abs(stageSize.width - canvasBox.width) <= 2
      && Math.abs(stageSize.height - canvasBox.height) <= 2
      && canvasBox.height > 300;
  }).toBe(true);
}

test("public drift status is available without login", async ({ page }) => {
  await mockAuthenticatedApi(page);
  await page.goto("/drift?embed=1");
  await expect(page.getByRole("heading", { name: "Vandforsyningen kører normalt" })).toBeVisible();
  await expect(page).toHaveURL(/\/drift\?embed=1$/);

  await page.setContent('<iframe title="Driftsstatus" src="/drift?embed=1"></iframe>');
  await expect(page.frameLocator('iframe[title="Driftsstatus"]').getByRole("heading", { name: "Vandforsyningen kører normalt" })).toBeVisible();
});

test("login and MapLibre maps fill their visible stages", async ({ page }) => {
  await mockAuthenticatedApi(page);
  const requestedAssets = { worker: false, tile: false };
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/maplibre-gl-worker\.mjs$/.test(pathname)) requestedAssets.worker = true;
    if (pathname.startsWith("/tiles/")) requestedAssets.tile = true;
  });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log ind på driftssystemet" })).toBeVisible();
  await page.getByLabel("E-mail").fill("drift@example.dk");
  await page.getByLabel("Adgangskode").fill("browser-smoke");
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/historik");
  await expect(page.getByRole("heading", { name: "Historik" })).toBeVisible();
  await page.getByRole("button", { name: "Brud" }).click();
  await page.getByRole("button", { name: "Vandlukning" }).click();
  await expect(page.getByRole("button", { name: "Brud" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Vandlukning" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/kort");
  await expectMapFillsStage(page, ".network-map", ".map-stage");
  await expect.poll(() => requestedAssets.worker).toBe(true);
  await expect.poll(() => requestedAssets.tile).toBe(true);

  await page.goto("/lukkescenarier");
  await expect(page.getByRole("heading", { name: "Lukkescenarier" })).toBeVisible();
  await expectMapFillsStage(page, ".network-map", ".closure-scenarios-map");

  await page.goto("/haendelser/ny");
  await page.getByRole("button", { name: "Angiv på kort" }).click();
  await expectMapFillsStage(page, ".incident-placement-map__canvas", ".incident-placement-map");
});
