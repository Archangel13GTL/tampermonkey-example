## NiceThumbsBuddy v3.0.0 — Unified, faster, more accessible (2025‑08‑26)

This release makes NiceThumbsBuddy the single flagship userscript and merges all features from prior work. It focuses on stability, performance, and accessibility so you can discover files quickly without losing anything.

### Highlights

* Unified script: NTB is now the only script. Duplicate `soulful-thumbs.user.js` removed.
* Toolbar polish: Brand, breadcrumbs, filter, sort, grid/list toggle, size/gap/label sliders, Sitemap, and Reveal Hidden Links.
* Views: Grid and List with natural sort; list shows Type, Resolution (MP), Size, and Date. Folders always appear first.
* Sorting: Name, Type, Size, Resolution, Date, Random. Metadata populates lazily and is cached.
* Lightbox: Zoom/pan, +/−/0 and f keys, arrow navigation, focus trap, labeled controls, and return focus on close.
* Metadata: On-demand HEAD requests for size/type; image dimensions cached; throttle and expiry for good hygiene.
* Sitemap: In-panel settings for root, depth, max pages, include files, extension filter, and new Concurrency field; live progress, Stop, Find-in-tree, Export JSON.
* Themes: Dark, Light, High Contrast, and Auto (follows OS).
* Auto-update: Installs from Releases and updates automatically.

### Notes

* The script hides the original index markup and renders its own accessible UI; a toggle reveals hidden anchors from tricky indexes.
* Scans and HEAD requests are same-origin and respect your browser’s policies.

### Install/Update

Use the Releases URL for automatic updates:
https://github.com/Archangel13GTL/tampermonkey-example/releases/latest/download/NiceThumbsBuddy.user.js

### ✨ New

* **Interactive sitemap panel**
  * Crawl all reachable autoindex pages from the current folder or domain root.
  * Set depth and page limits, choose whether to include files, and filter by extensions (e.g. jpg,png,gif).
  * Live progress indicator and stop button; concurrency‑limited scanning for speed without missing nodes.
  * Find‑in‑tree search and collapsible nodes; Ctrl/Cmd‑click any item to jump directly.
  * Export the discovered structure as JSON for auditing or backup.

* **Reveal hidden links (page)**
  * A toggle in the sitemap panel forces otherwise hidden anchors (via CSS) to be visible, ensuring nothing slips through.

* **Grid ↔ list view**
  * The new list view displays file type, resolution (MP), size (bytes) and last modified date (if available).  Natural sort is used throughout.
  * Sort by name, type, resolution, size, date or random (metadata is fetched on demand and cached).  Folders always appear first.

* **Bigger labels & adjustable fonts**
  * Folder names now default to a larger, high‑contrast font.  A slider lets you adjust the label size to suit your screen and comfort level.

* **More robust crawling & caching**
  * The file parser has been hardened to handle diverse index styles (classic `<pre>`, table‑based FancyIndex, and minimal FancyIndex) and extract metadata when available.
  * Optional advanced metadata fetch (HEAD requests) occurs only for items in the viewport, with throttling and caching to minimise server load.

* **Accessibility & UX polish**
  * Lightbox now traps focus inside and returns it on close; marked with `role="dialog"` and `aria-modal="true"`.
  * Zoom and pan controls now support keyboard (`+`, `-`, `0`, `f`, `g`), pointer events, and pinch gestures.
  * Reduced‑motion preferences respected for animations.

### 📹 Demo GIF shot list

To illustrate version 2.0.0 in action, record a single ~20 second GIF at 1280×720 resolution:

1. **Landing** — open a directory index and watch Soulful Thumbs load the grid with large, readable folder labels.
2. **Sitemap scan** — open the sitemap panel, set depth=2, include files, and hit *Scan*.  Show the progress bar and expand a few nodes.  Use the search filter to find a folder; Ctrl‑click it to jump there.
3. **Toggle list view** — switch from grid to list view; highlight the new columns (Type, Resolution, Size, Date) and sort by Resolution.
4. **Reveal hidden** — toggle *Reveal hidden links* on the current page and watch previously invisible anchors appear.
5. **Lightbox navigation** — click a file in list view to open the lightbox; zoom in, pan around, reset zoom and close.

Keep the cursor motion purposeful and pause briefly after each action for clarity.

## References

[1] Zig Ziglar, *Secrets of Closing the Sale*. New York: Doubleday, 1984.

[2] Dale Carnegie, *How to Win Friends and Influence People*. New York: Simon & Schuster, 1936.


— 2025‑08‑19
