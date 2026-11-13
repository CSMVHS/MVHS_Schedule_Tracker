# Next Instructions: Admin Dashboard Redesign & Performance Overhaul

> **Scope:** Redesign `admin/index.html`, `admin/admin.css`, and `admin/admin.js` only. Preserve all existing Firebase RTDB data paths, settings keys, commands, and `../js/custom-ui.js` compatibility so the main display (`index.html` / `js/bar.js`) continues working with zero breaking changes.

---

## 1. Visual Design Principles (Non-AI, Human-Crafted Console)

Strip out generic "AI dashboard" visual clichés and replace them with a **restrained, crisp, utilitarian Master-Detail Split Workspace**:

- **No glassmorphism or glow clutter:** Remove `backdrop-filter: blur(...)`, translucent dark overlays, radial-gradient background blobs, and heavy drop shadows. Use **solid, flat surface tiers** with crisp `1px` hairline borders:
  - Canvas background: `#090d0b`
  - Primary panel / inspector surface: `#101613`
  - Elevated control / input / hover surface: `#161e1a`
  - Hairline borders: `rgba(255, 255, 255, 0.09)` (default) and `rgba(255, 255, 255, 0.16)` (hover/active)
- **Restrained MVHS palette:** Keep `#00401e` (MVHS green) and `#b1953a` (MVHS gold) as disciplined functional accents (active selection indicators, primary save buttons, focus rings), not loud full-card tints. Use semantic status dots (`#10b981` online, `#f59e0b` inactive, `#ef4444` offline) instead of noisy multi-color card top borders.
- **Disciplined typography & hierarchy:**
  - Use `Google Sans Flex` for UI labels and `DM Mono` with `font-variant-numeric: tabular-nums` for device IDs, counts, uptime, offsets, and timestamps.
  - Avoid putting icons next to every single heading, avoid overly tracked-out ALL-CAPS headers everywhere, and avoid stacking colored pill badges inside every card. Keep rows tight, scannable, and quiet.

---

## 2. Lucide Iconography & Sizing Standards

Replace ad-hoc icon sizing and full-DOM `lucide.createIcons()` re-scans with explicit sizing classes and fast rendering:

- **Consistent CSS size classes:**
  - `.icon-xs` (`14px × 14px`): inline metadata, status badges, search icon, small chips
  - `.icon-sm` (`16px × 16px`): buttons, list row indicators, close/back buttons
  - `.icon-md` (`18px × 18px`): section headers, top navbar brand icon
  - `.icon-lg` (`24px × 24px`): login header / empty inspector state
  - Set `stroke-width: 1.75`, `flex-shrink: 0`, and `vertical-align: middle` cleanly via flex alignment (avoid `vertical-align: -0.18em` hacks).
- **Performance rule for list rows:** Never call `window.lucide.createIcons()` over the entire `document` after rendering device rows. Either:
  - Render static UI chrome icons once on mount, and for dynamic device rows use **cached inline SVG strings** (generated once from `lucide.icons[name]` or pre-cached templates) or pass `{ nodes: [rowEl] }` / scoped node batching only for newly created rows.

---

## 3. Layout & Information Architecture

### A. Slim Top Header Bar
- Compact single-row header (`56px` height) with MVHS Tracker Admin title, subtle live fleet summary counts inline (`Online`, `Inactive`, `Offline`, `Total` with `tabular-nums`), and `Logout` button.
- Remove the separate 6-card KPI banner row; keep fleet counts compact and immediately readable in the header / filter bar.

### B. Unified Top Global Controls Section (No Tabs)
- Place **all** Global Controls in **one clean, structured section at the top**, directly above the split-screen device workspace — **without tabs**:
  1. **Quick Actions**: `Refresh All`, `Hard Reload All`, `Hold to Show Device IDs`, `Clear All Device Names`, `Reset Global Defaults`.
  2. **Theme & Display**: Background Mode (`Solid Color`, `Gradient`, `Image Link`), Background/Bar/Text/Accent color controls, Bar Animation Style, Clock Format, and `Apply Theme to All`.
  3. **Snow & Announcements**: Snow Effect Override segmented control (`Auto`, `Force On`, `Force Off`) + Global Lower-Bar Announcement enable checkbox, character counter, text input, `Save Announcement`, and `Clear`.
- Organize these three groups cleanly into a compact multi-column or stacked utility bar so everything is visible at a glance on desktop without tab switching.
- **Mobile (`< 860px`):** Include a clean, subtle toggle/collapsible summary bar for the Global Controls section (collapsed by default on small viewports or easily toggled) so the device list is immediately reachable on phones without scrolling past all global settings.

### C. Master-Detail Split Workspace (List + Inline Inspector)
Below the Global Controls section, use a **2-pane split workspace** (`grid-template-columns: minmax(340px, 440px) 1fr` on desktop, locked cleanly to viewport height or comfortable scrollable panes):

1. **Left Pane — Compact Device List (Not a Grid):**
   - Sticky list toolbar with:
     - Status filter segmented bar: **`Online` (default)**, **`All`**, **`Inactive`**, **`Offline`** (showing live counts per status). Defaulting to `Online` (or `Online + Inactive`) keeps the default view focused and fast instead of dumping 1,700+ offline rows immediately.
     - Search input (`Search name, ID, browser...`) + clear button.
   - **List row design:** Single compact horizontal row (`min-height: 56px`, `1px` bottom hairline divider, subtle active left accent bar when selected):
     - Left: Status dot + Display Name + monospace Device ID + tiny color swatch dot / active override indicator (only if non-default).
     - Right: Time offset badge (only if `!= 0`) + relative last-seen or current period + chevron (`chevron-right`, `14px`).
   - **Pagination / Windowing:** Render at most **50 rows** per batch with a clean `"Load 50 more (X remaining)"` footer button when filtered results exceed 50, ensuring DOM node count stays tiny even when viewing `All` or `Offline`.

2. **Right Pane — Inline Device Inspector (No Pop-up Modal on Desktop):**
   - Desktop shows a persistent right-hand Inspector pane:
     - **Empty state** (before selection): centered muted icon + `"Select a display from the list to inspect and configure"` message.
     - **Selected state:** Displays the device header (Name, ID, live status badge), `General` (Display Name), `Theme & Behavior` (Background Mode/Color/Gradient/Image, Bar/Text/Accent Colors, Bar Style, Clock Format, Time Offset, Snow Override, Announcement Override, toggles for Weather/Total Time/Credits/Low Perf), `Override Message`, `Save Device Settings`, `Metadata & Health` (clean key-value rows), and `Remote Actions` (`Refresh`, `Hard Reload`, `Delete Device`).
   - **Mobile (`< 860px`):** Tapping a device row opens the Inspector as a **full-height slide-over panel** with a clear `← Back to Displays` header button (no cramped modal box).

---

## 4. Non-Laggy Loading & Real-Time Firebase Sync Architecture

The database holds ~1,750+ devices. Replace the current full-tree `.on('value')` rebuild pattern with an incremental, low-latency pipeline:

1. **Initial Skeleton Loading State:**
   - Immediately render 6–8 lightweight skeleton placeholder rows in the list pane (and disable/placeholder the fleet counts) while Firebase auth/initial data loads.
   - Dismiss the skeleton state cleanly once initial hydration completes (e.g., via `.once('value')` for initial load or an initial hydration marker).
2. **Granular Firebase Listeners (`child_added`, `child_changed`, `child_removed`):**
   - Do **not** attach `.on('value')` to `db.ref('devices')` (which re-downloads and re-parses all 1,750+ devices every few seconds when any single TV sends a heartbeat).
   - Hydrate once with `db.ref('devices').once('value')` to populate `devicesData` quickly, then listen incrementally with `child_added`, `child_changed`, and `child_removed` (ignoring initial `child_added` duplicates via key check).
3. **Surgical DOM Updates (Zero Full-List Nukes on Heartbeats):**
   - On `child_changed`: update `devicesData[id]` in memory, throttle/coalesce KPI count updates (`requestAnimationFrame` or `250ms`), and:
     - If `id` is currently rendered in the visible DOM list, **patch only that row's DOM elements in place** (status dot, name, last-seen/period) rather than clearing `#device-list` and rebuilding all rows.
     - If `id === currentDeviceId`, update **only** the read-only Metadata & Health labels in the Inspector (never overwrite unsaved form inputs while the admin is editing!).
   - Only re-sort / re-render the visible slice when filter, search query, pagination limit, or a device's online/offline bucket actually changes.

---

## 5. Verification Checklist (For Implementation Turn)

When implementing these instructions:
1. Verify with a large mock dataset (e.g., 1,750+ devices with rapid heartbeat updates) that DOM row count stays capped (`<= 50` rows rendered initially), `child_changed` patches a single row without rebuilding the list, and search/filter switching remains instantaneous.
2. Verify all Lucide icons have explicit, consistent sizing (`14px`/`16px`/`18px`) and zero oversized/misaligned SVGs.
3. Verify all Global Controls (Actions including `Clear All Device Names` & `Reset Defaults`, Theme & Display, Snow Override, Global Announcement) appear in the unified top section **with no tabs**.
4. Verify Desktop (`1280×800`) shows the side-by-side Master-Detail Split Workspace with inline Inspector, and Mobile (`375×812`) shows collapsible Global Controls + slide-over Inspector with a `Back` button.
5. Confirm zero console errors and zero regressions to `devices/<id>/settings`, `devices/<id>/command`, `global/snowOverride`, `global/announcement`, `global/showDeviceIDs`, or `global/resetNamesTs`.
