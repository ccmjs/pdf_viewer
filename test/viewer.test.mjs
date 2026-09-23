/**
 * End-to-end regression test with real PDF.js rendering in an isolated browser context.
 * Serve the repository root first; see README.md for setup and environment overrides.
 * The flow deliberately reuses one instance to exercise restart/cleanup and session state.
 * English UI assertions cover the demo; the custom instance uses the German defaults.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

// Run against a local static server. CHROME_PATH can select an installed Chrome.
test("PDF viewer: real rendering, navigation, options, extensions and lifecycle", async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") console.log("Browser:", message.text()); });
    await page.goto(process.env.VIEWER_URL || "http://127.0.0.1:8765/");
    await page.locator(".textLayer span").first().waitFor();
    await page.getByRole("link", { name: "Password-protected PDF", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill("viewer-test");
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
    await page.locator(".textLayer span").first().waitFor();
    await page.reload();
    await page.locator(".textLayer span").first().waitFor();
    assert.equal(await page.locator(".password-form").count(), 0);
    await page.getByRole("link", { name: "Standard PDF", exact: true }).click();
    await page.locator(".textLayer span").first().waitFor();
    // Switch from the public demo to an inspectable instance with extension event recording.
    await page.evaluate(async () => {
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      window.events = [];
      window.app = await ccm.start("./ccm.pdf_viewer.mjs", {
        pdf: "./resources/demo.pdf", filename: "demo.pdf",
        extensions: [async ({ app, type }) => {
          window.events.push(type);
          if (type === "init") {
            // Exercise classic scrollbars even on systems using overlay scrollbars.
            const style = document.createElement("style");
            style.textContent = ".viewport::-webkit-scrollbar { width: 16px; height: 16px; }";
            app.element.getRootNode().append(style);
          }
        }],
      }, host);
    });
    assert.equal(await page.locator("canvas").count(), 1);
    assert.deepEqual(await page.evaluate(() => {
      const viewport = app.element.querySelector(".viewport");
      return {
        hasScrollbarGutter: viewport.offsetWidth > viewport.clientWidth,
        verticalOverflow: viewport.scrollHeight > viewport.clientHeight,
        horizontalOverflow: viewport.scrollWidth > viewport.clientWidth,
      };
    }), { hasScrollbarGutter: true, verticalOverflow: true, horizontalOverflow: false });
    assert.equal(await page.getByRole("button", { name: "Zurück", exact: true }).isDisabled(), true);
    assert.equal(await page.locator(".pdf-link").count(), 2);
    assert.deepEqual(await page.evaluate(() => events.slice(0, 6)), ["init", "ready", "before-start", "loaded", "render", "start"]);
    // Keyboard navigation must honor boundaries without hijacking text editing or modifiers.
    await page.locator(".viewport").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.evaluate(() => app.state.page), 1);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => app.state.page === 2 && !app.gui.busy);
    await page.keyboard.press("Shift+ArrowRight");
    assert.equal(await page.evaluate(() => app.state.page), 2);
    await page.getByRole("spinbutton").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => app.state.page), 2);
    await page.locator(".viewport").focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(() => app.state.page === 1 && !app.gui.busy);
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.waitForFunction(() => app.state.page === 2 && !app.gui.busy);
    await page.getByRole("spinbutton").fill("3");
    await page.getByRole("spinbutton").press("Enter");
    await page.waitForFunction(() => app.state.page === 3 && !app.gui.busy);
    assert.equal(await page.getByRole("button", { name: "Weiter", exact: true }).isDisabled(), true);
    await page.locator(".viewport").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => app.state.page), 3);
    await page.locator('.pdf-link[href="#"]').click();
    await page.waitForFunction(() => app.state.page === 1 && !app.gui.busy);
    await page.locator('.pdf-link[href="#"]').click();
    await page.waitForFunction(() => app.state.page === 3 && !app.gui.busy);
    assert.equal(await page.evaluate(async () => {
      try { await app.goToPage(999); } catch (error) { return error.name; }
    }), "RangeError");
    assert.equal(await page.evaluate(() => app.state.page), 3);
    await page.evaluate(() => app.setZoom(1));
    assert.equal(await page.locator(".zoom-value").innerText(), "100 %");
    assert.equal(await page.evaluate(() => {
      const span = app.element.querySelector(".textLayer span");
      const range = document.createRange(); range.selectNodeContents(span);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      return selection.toString().length > 0;
    }), true);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Herunterladen" }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "demo.pdf");
    await page.waitForFunction(() => !app.gui.busy);
    await page.screenshot({ path: join(tmpdir(), "pdf-viewer-desktop.png") });
    // Check that all three optional capabilities remain independent.
    for (const links of [false, true]) for (const textSelection of [false, true]) {
      await page.evaluate(async (options) => { Object.assign(app, options); await app.start(); }, { links, textSelection });
      assert.equal(await page.locator(".pdf-link").count(), links ? 2 : 0);
      assert.equal(await page.locator(".textLayer").count(), textSelection ? 1 : 0);
    }
    await page.evaluate(async () => {
      app.links = false; app.download = false; app.textSelection = false;
      await app.start();
    });
    assert.equal(await page.locator(".pdf-link, .textLayer").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Herunterladen" }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !app.gui.busy && app.element.querySelector("canvas").getBoundingClientRect().width < 390);
    await page.screenshot({ path: join(tmpdir(), "pdf-viewer-mobile.png") });
    // This deliberate 404 verifies recovery from loading failures on the same instance.
    await page.evaluate(async () => { app.pdf = "./resources/missing.pdf"; try { await app.start(); } catch {} });
    assert.match(await page.locator(".status").innerText(), /nicht geladen/);
    assert.equal(await page.getByRole("button", { name: "Weiter", exact: true }).isDisabled(), true);
    await page.evaluate(async () => { app.pdf = "./resources/demo.pdf"; await app.start(); await app.destroy(); });
    assert.equal(await page.locator("canvas").count(), 0);
    await page.evaluate(() => app.start());
    assert.equal(await page.locator("canvas").count(), 1);
    // Multiple instances work independently with the repository-relative assets.
    const nested = await browser.newPage();
    await nested.goto(page.url());
    await nested.addScriptTag({ url: "/libs/framework/ccm.js" });
    assert.deepEqual(await nested.evaluate(async () => {
      const a = document.createElement("div"), b = document.createElement("div");
      document.body.replaceChildren(a, b);
      const first = await ccm.start("/ccm.pdf_viewer.mjs", { pdf: "./resources/demo.pdf" }, a);
      const second = await ccm.start("/ccm.pdf_viewer.mjs", { pdf: "./resources/demo.pdf", page: 2 }, b);
      await first.goToPage(3);
      const result = [first.state.page, second.state.page];
      await first.destroy();
      await second.goToPage(1);
      result.push(second.state.page);
      await second.destroy();
      return result;
    }), [3, 2, 1]);
    await nested.close();
    // Reuse the demo PDF, clearing only its cached password so the prompt is tested again.
    await page.evaluate(async () => {
      app.pdf = "./resources/protected.pdf";
      const url = new URL(app.pdf, document.baseURI);
      url.hash = "";
      sessionStorage.removeItem(`ccm.pdf_viewer.password:${url.href}`);
      app.password = "viewer-test";
      await app.start();
    });
    assert.equal(await page.locator("canvas").count(), 1);
    assert.equal(await page.locator(".password-form").count(), 0);
    // Do not await start() here: the test must interact with the pending password form first.
    await page.evaluate(() => {
      app.password = "";
      window.opening = app.start();
    });
    await page.locator('.password-form input').waitFor();
    await page.locator('.password-form input').fill("wrong");
    await page.locator('.password-form button[type="submit"]').click();
    await page.waitForFunction(() => app.element.querySelector(".status").textContent.includes("falsch"));
    await page.locator('.password-form input').fill("viewer-test");
    await page.locator('.password-form input').press("Enter");
    await page.evaluate(() => opening);
    assert.equal(await page.locator("canvas").count(), 1);
    assert.equal(await page.evaluate(() => app.password), "");
    assert.equal(await page.locator(".password-form").count(), 0);
    await page.evaluate(() => app.start());
    assert.equal(await page.locator(".password-form").count(), 0);
    await page.evaluate(() => { app.rememberPassword = false; window.opening = app.start(); });
    await page.locator('.password-form input').waitFor();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await page.evaluate(() => opening);
    await page.evaluate(() => {
      app.rememberPassword = true;
      const key = `ccm.pdf_viewer.password:${new URL(app.pdf, document.baseURI).href}`;
      sessionStorage.setItem(key, "outdated-password");
      window.opening = app.start();
    });
    await page.waitForFunction(() => app.element.querySelector(".status").textContent.includes("falsch"));
    assert.equal(await page.evaluate(() => sessionStorage.getItem(
      `ccm.pdf_viewer.password:${new URL(app.pdf, document.baseURI).href}`)), null);
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await page.evaluate(() => opening);
    await page.evaluate(() => { app.password = "wrong"; window.opening = app.start(); });
    await page.locator('.password-form input').waitFor();
    assert.match(await page.locator(".status").innerText(), /falsch/);
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await page.evaluate(() => opening);
    assert.match(await page.locator(".status").innerText(), /abgebrochen/);
    assert.equal(await page.evaluate(() => app.gui.busy), false);
    await page.evaluate(() => { app.password = ""; window.opening = app.start(); });
    await page.locator('.password-form input').waitFor();
    await page.evaluate(() => app.destroy());
    assert.equal(await page.locator(".password-form").count(), 0);
    await page.evaluate(async () => { app.pdf = "./resources/demo.pdf"; await app.start(); });
    assert.equal(await page.locator("canvas").count(), 1);
    assert.deepEqual(errors, []);
    await page.evaluate(() => app.destroy());
  } finally { await browser.close(); }
});
