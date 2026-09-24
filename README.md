# ccmjs PDF Viewer

A buildless ccmjs component for displaying one PDF page at a time, powered by
locally bundled **PDF.js 6.3.289**. Includes previous/next navigation, direct page
entry, zoom, optional links, text selection and download.

With focus inside the viewer, use **Left/Right arrow keys** to move to the previous
or next page. Click the PDF area or focus it with Tab first. Input fields and
shortcuts with modifier keys keep their normal behavior; navigation stops at the
first and last page.

## Quick start

Serve this repository over HTTP(S) and open `index.html` for the three-page demo.
Choose **Password-protected PDF** (or open `index.html?demo=protected`) to test
the password prompt. Its password is **`viewer-test`**. Both English configurations
are exported from `resources/configs.mjs` as `demo` and `protectedDemo`; the latter
loads `resources/protected.pdf` without a preset password so the prompt is shown
on the first visit in a tab.
Opening the HTML directly with `file://` is not supported by browser module/worker loading.

```html
<script src="./libs/framework/ccm.js"></script>
<div id="pdf"></div>
<script type="module">
  const viewer = await ccm.start("./ccm.pdf_viewer.mjs", {
    pdf: "./resources/demo.pdf",
    links: true,
    download: true,
    textSelection: true,
    page: 1,
    zoom: "page-width",
  }, document.querySelector("#pdf"));
</script>
```

The component uses the bundled ccmjs 28 framework and Shadow DOM encapsulation.
Framework, library, worker and stylesheet paths use the `././` prefix. In this
repository they remain relative to the embedding page, so the included demo works
as a self-contained ZIP distribution when served over HTTP(S). The ccmjs versioning
process replaces these prefixes with absolute GitHub Pages URLs for published versions.
The configured PDF URL is relative to the embedding page unless absolute.
Cross-origin servers must allow CORS.
Dependencies are declared via `ccm.load`; no npm install or build is needed to use the viewer.

## Configuration

Configuration is also documented directly in `ccm.pdf_viewer.mjs`.

| Property | Default | Meaning |
| --- | --- | --- |
| `pdf` | `"././resources/demo.pdf"` | PDF URL; HTTP(S) and Blob URLs are accepted. Set to `""` to display an empty-viewer hint. |
| `password` | `""` | Optional initial PDF password. Missing or incorrect passwords trigger an in-viewer prompt. |
| `rememberPassword` | `true` | Reuse successful form entries from sessionStorage for the same PDF URL. Set to `false` to disable reading and writing cached passwords. |
| `links` | `true` | Enable existing external and internal PDF links. External links open a new tab. |
| `onLink` | `null` | Optional async `({ app, page })` callback for internal PDF links. Receives the resolved one-based page and replaces default navigation. Called after releasing the viewer lock, so the host can await `app.goToPage(page)`. External links remain unchanged. |
| `download` | `true` | Show the download button and enable `downloadPdf()`. |
| `textSelection` | `true` | Allow selection/copying through PDF.js's text layer. |
| `navigation` | `true` | Show page controls and enable arrow-key navigation. Set to `false` when an embedding component controls the sequence. `goToPage()` remains available. |
| `page` | `1` | Initial page, clamped to the document's range. |
| `zoom` | `"page-width"` | Fit available width, or a number between `0.25` and `4`. `1` means 100%. |
| `filename` | `"document.pdf"` | Suggested filename for downloading the original PDF. |
| `labels` | German labels | UI strings; individual keys can be overridden. |
| `extensions` | `[]` | Sequential extension functions, following the quiz convention. |
| `pdfjs`, `css`, `worker`, `cMaps`, `fonts`, `wasm` | Bundled resources | Override dependency locations if needed; keep API and worker versions identical. |

Fit-to-width follows container resizing, bounded by the same 25–400% zoom range.
Large pages scroll inside the component. Only one page canvas is displayed;
raster resolution is capped at 16 megapixels and twice the CSS resolution.

`download: false` disables the viewer's download action, not browser access to
the original PDF. Similarly, disabling selection is not copy protection.
Scanned PDFs without embedded text have no selectable text; OCR is not included.

## Instance API

```js
await viewer.goToPage(3);        // One-based integer; rejects out-of-range input
await viewer.setZoom(1.25);     // 125%
await viewer.setZoom("page-width");
await viewer.downloadPdf();     // No-op if download is disabled
const state = viewer.state; // { page, pages, zoom, scale }, or null

viewer.pdf = "./another.pdf";
await viewer.start();           // Release old PDF and load the new configuration
await viewer.destroy();         // Release worker, resize observer and Blob URLs before removing the host
```

Async actions expose `gui.busy`. As in the quiz component, actions requested while
busy are ignored. Public methods reject on failures; DOM handlers consume those
rejections after showing a status message. `error` contains the original error.
`destroy()` cancels a pending password prompt and waits for the current action;
an instance can be started again afterwards.

`viewer.state` exposes the current state directly, with these fields:

| Field | Meaning |
| --- | --- |
| `page` | Current physical page number, starting at 1. |
| `pages` | Total page count. |
| `zoom` | Requested numeric zoom or `"page-width"`. |
| `scale` | Effective numeric zoom, including the result of width fitting. |

`state` is initialized after loading and updated after successful rendering;
`loaded` extensions therefore see the initial state before the first page is drawn.
Use `goToPage()` and `setZoom()` to change the displayed page rather than assigning
state fields. Changing `page`, `zoom` or other configuration properties takes effect
on the next `start()`; ordinary navigation updates state, not those configuration defaults.

## Password-protected PDFs

Set `password` in the configuration to open a protected PDF directly, or leave it
empty to ask the user when necessary. Incorrect passwords show a retry message.
The prompt supports Enter to submit and a Cancel button. Cancelling releases the
loading task, emits `cancel` and resolves `start()` without a document; call
`start()` again to retry. While waiting for a password, `start()` remains pending.
To retain access to the instance during that wait, use `ccm.instance()` followed
by `instance.start()`.

Passwords entered in the form are cleared after submission and are not copied to
`config`, `state` or extension events. A password explicitly supplied
in configuration remains part of that configuration and is visible to page code.
By default, successful form entries are kept in `sessionStorage` per absolute PDF
URL (excluding the fragment), scoped to the embedding origin and browser tab.
They survive reloads for that tab's session and are readable by same-origin page
scripts. Incorrect saved passwords are removed and the prompt reappears. Set
`rememberPassword: false` to ignore and stop saving cached passwords. If storage
is blocked or full, the viewer continues with the interactive prompt. Explicit
`password` configuration takes precedence and is not automatically saved.
Disabling remembrance does not delete existing entries. To forget one cached password:

```js
const url = new URL(viewer.pdf, document.baseURI);
url.hash = "";
sessionStorage.removeItem(`ccm.pdf_viewer.password:${url.href}`);
```

Downloads retain the original PDF's encryption.

## Extensions

Extensions receive **`{ app, type }`**, are awaited in configuration order and can
read `app.state`, `app.error` and `app.element`. There is no `onaction` callback.

```js
export async function rememberPage({ app, type }) {
  if (type === "page") {
    console.log("Current page:", app.state.page);
  }
}
```

Load this function through a dependency:

```js
extensions: [["ccm.load", "./extensions.mjs#rememberPage"]]
```

| Event | When it runs |
| --- | --- |
| `init`, `ready` | ccmjs instance lifecycle |
| `before-start` | Before releasing/loading the document |
| `loaded` | PDF metadata and initial state are available |
| `render` | The new page, text and link layers have been displayed |
| `start` | Initial rendering is complete, or the empty-URL hint is shown |
| `page` | A page navigation has rendered, including internal links |
| `zoom` | A zoom or fit-to-width resize has rendered |
| `download` | The browser download has been requested |
| `error` | An action failed; inspect `app.error` |
| `cancel` | Opening a protected PDF was cancelled |
| `destroy` | Resources and component content have been released |

Typical initial sequence: `init → ready → before-start → loaded → render → start`.
Extensions run within the active action. They should not await `destroy()` from
inside an event, or trigger another navigation while the viewer is busy.
`render` runs after the DOM/state update but before the controls are refreshed and
the busy lock is released. Extension errors propagate and stop later extensions;
an `error` extension should avoid throwing so it does not mask the original failure.
The private PDF.js document proxy is not exposed to extensions.

## Repository guide

| File or directory | Responsibility |
| --- | --- |
| `ccm.pdf_viewer.mjs` | Configuration, instance API, lifecycle, DOM construction and PDF.js integration. |
| `index.html` | English demo shell; selects a named configuration from the query string. |
| `resources/configs.mjs` | Standard and protected demo configurations, including English labels. |
| `resources/styles.css` | Component layout and link overlay; complements PDF.js's text-layer CSS. |
| `resources/demo.pdf`, `resources/protected.pdf` | Three-page English examples with external and internal links. |
| `test/viewer.test.mjs` | Browser integration test against the real framework, worker and PDFs. |
| `libs/framework/` | Bundled ccmjs 28.0.0 and its MIT license. |
| `libs/pdfjs/` | Unmodified PDF.js distribution files, auxiliary assets and upstream notices. |
| `LICENSE` | MIT license for this component. |

Start reading the component at `config`, then `start()`, `run()` and `render()`.
The remaining methods implement navigation, downloads, cleanup and UI details.
Each instance keeps its own PDF document, DOM references and interaction state.
`run()` prevents overlapping actions; a resize during an action is deferred until
the action finishes. Password form submissions resume the pending PDF.js request
directly because `start()` holds that lock while waiting for input.

Rendering builds a canvas plus optional text and link overlays off-DOM, then
replaces the visible page. All layers use the same PDF viewport transformation.
When changing layout, keep the horizontal padding in `styles.css` consistent with
the width calculation in `render()`. PDF.js CSS variables also control text-layer
alignment; keep them in sync with canvas scaling and PDF user units.

The bundled libraries are upstream code, not places for component-specific changes.
When updating PDF.js, replace its display API, worker, styles and auxiliary assets
from the same upstream release and retain all license notices. Then run the browser
tests and check text/link alignment with representative PDFs.

## Scope

Existing PDF links are overlaid on the rendered page; internal links navigate to
their target page while preserving the chosen zoom. Destination-specific scrolling
coordinates and zoom instructions are not applied. Only HTTP(S), mail and telephone
external links are enabled; embedded scripts and launch actions are not executed.

The viewer uses PDF.js's text layer and a link-only annotation overlay. Other
annotations may appear in the rendered PDF, but there is no interactive comment,
form or annotation editor. Password-protected PDFs support an initial configured
password and an interactive password prompt.

Modern browsers with module workers and PDF.js support are required. The integration
test covers Chrome; other browsers have not yet been verified for this component.

## Verification

Start a static server, install Playwright in your development environment and run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
# In another terminal:
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node --test test/viewer.test.mjs
```

Optional environment variables: `VIEWER_URL` (server URL), `PLAYWRIGHT_PATH`
(Playwright module location), `CHROME_PATH` (installed browser executable).
The browser test covers rendering, navigation, page bounds, text selection,
internal links, download, disabled options, responsive fitting, extension events,
missing files, restart and cleanup. It also covers arrow keys, both demos, password
retries/cancellation, session reuse and invalid cached passwords. Screenshots
`pdf-viewer-desktop.png` and `pdf-viewer-mobile.png` are written to the system temp directory.
The test deliberately requests a missing PDF, so its HTTP 404 is expected.
It uses a fresh browser context; existing session passwords in your regular browser
do not affect the test. Test dependencies are only for development, not the ZIP demo.

## License

Component code and demo: MIT, see `LICENSE`.
Bundled PDF.js: Apache-2.0, see `libs/pdfjs/LICENSE`; additional font and codec
notices remain in their respective resource directories. Bundled ccmjs: MIT,
see `libs/framework/LICENSE`.
