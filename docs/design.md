# Echo — visual design system

This document describes the **intended look and feel** of the Echo UI: theme, colors, typography, spacing, and layout. It is the reference for **new screens and components**. The **source of truth for implementation** is `src/App.css` (CSS variables and class names); if this doc and the stylesheet disagree, **update both** when you change tokens or patterns.

---

## 1. Theme concept

- **Role:** Echo is a **desktop API client** (Postman-class): one window, dense information, minimal chrome. The UI should feel **calm, readable, and tool-like**—closer to a code editor or GitHub’s dark UI than to a marketing site.
- **Mode:** **Dark only** (`color-scheme: dark` on `:root`). There is no light theme in scope; do not add ad hoc light backgrounds.
- **Density:** **Compact but not cramped**: enough padding to separate sections, tight enough to show URL, env, auth, body, script, and response without wasted space.
- **Hierarchy:** **Structure through elevation and borders**, not heavy shadows. Primary content sits on `--bg`; panels and inputs step up to `--bg-elevated` with `--border` dividers.

---

## 2. Color system

Colors are centralized on **` :root`** in `src/App.css`. **Prefer these variables** for any new UI; avoid hard-coded hex except where the file already uses a fixed accent (e.g. primary green buttons).

| Token | Typical use | Hex (current) |
|-------|-------------|----------------|
| `--bg` | App background, main canvas, response area base | `#0f1419` |
| `--bg-elevated` | Sidebar, cards, inputs, section panels, modals | `#161b22` |
| `--border` | 1px dividers, input outlines | `#30363d` |
| `--text` | Primary labels and values | `#e6edf3` |
| `--muted` | Secondary labels, hints, meta (timing, section chrome) | `#8b949e` |
| `--accent` | Links, focus rings, sidebar “+ Folder”-style actions, tree selection emphasis | `#58a6ff` |
| `--danger` | Errors, destructive actions, validation (e.g. invalid name) | `#f85149` |
| `--success` | Success status, positive inline actions (e.g. tree inline confirm ✓) | `#3fb950` |

**Semantic usage (patterns):**

- **Primary action (Send, confirm):** filled **green** `#238636` with white text—used for `.toolbar button.primary` and equivalent “do it” actions. This is **not** the same as `--success`; green buttons are the main “execute” affordance.
- **Selection / navigation:** **Blue** tints derived from `--accent` (e.g. `rgba(88, 166, 255, 0.12–0.35)` for backgrounds, active tree row).
- **Destructive:** text and borders use `--danger`; hover may use a light red wash (`rgba(248, 81, 73, 0.15)`).
- **Tree / icons:** folder glyphs use the existing emoji/icon treatment in the tree; do not introduce a second accent palette for folders unless migrating the whole tree.

---

## 3. Layout

- **Shell:** `app-shell` is a **two-column grid**: fixed **280px** sidebar + flexible main (`grid-template-columns: 280px 1fr`), full viewport height.
- **Sidebar:** brand row, **+ Folder**, scrollable tree, optional path hint at bottom. **Border-right** separates from main.
- **Main:** vertical stack—**toolbar** (method, URL, Send), scrollable **request panel** (sections), **response panel** (min height ~200px, max ~45vh) with top border.
- **Sections:** `.section` uses **6px** corner radius, **10px** padding, **1px** border, `--bg-elevated` fill. Section titles are **uppercase**, **12px**, **muted**, with letter-spacing—see `.section h3`.

---

## 4. Shapes and radii

- **Default radius:** **4px** for inputs, buttons, tree rows, toolbar controls.
- **Larger radius:** **6px** for section containers, context menus, dialogs, toasts (8px on some overlays).
- **Borders:** typically **1px solid `var(--border)`**; focus states may use **1px `var(--accent)`** outline with small offset on tree rows.

---

## 5. Typography

- **UI (default):** system stack — `"Segoe UI", system-ui, -apple-system, sans-serif` at **13px** base on `:root`.
- **Section labels:** **12px**, uppercase, **muted** (see `.section h3`).
- **Monospace:** `ui-monospace, SFMono-Regular, Menlo, monospace` at **12px** for response body, raw JSON, body editor, scripts—**do not** use monospace for general labels or buttons.

---

## 6. Spacing and rhythm

- **Toolbar:** `8px 12px` padding, **8px** gap between controls.
- **Request panel:** **12px** padding, **12px** gap between sections (flex column).
- **Tree:** **8px 4px** outer padding; row padding **4px 8px**; **6px** gap between chevron/icon and label.
- **Form rows:** grids like `.kv-row` use **6px** gaps; inputs often **6px 8px** vertical padding inside fields.
- **Environment entries:** `.env-entry-row` uses a **narrow** kind column (`minmax(6.5rem, 9rem)`), then **name** and **value** columns (`1fr` / `2fr`) so long paths get space; **6px** gap.
- **Environment entry placeholders:** Use lowercase **`name`** (key), **`value`** (variable and secret value fields; secret replace hint **`new value (replaces stored)`**), and **`path`** (file path). Do not mix `Value` / `value` for the same role.
- **Secret saved feedback:** After a secret value is persisted (desktop), the stored row shows a short **Saved** state (success tint on the control, then reverts to **Stored** after a few seconds).

Keep new layouts **aligned to these multiples** (4 / 6 / 8 / 12) unless there is a strong reason to break rhythm.

---

## 7. Components (consistency rules)

- **Inputs and selects:** `--bg` or `--bg-elevated` fill, `--border`, **4px** radius, inherited text color.
- **Secondary buttons:** bordered, `--bg`-ish fill, hover **light white overlay** (`rgba(255,255,255,0.06)`).
- **Context menus:** fixed position, `--bg-elevated`, **6px** radius, soft shadow; items **4px** radius, full width.
- **Confirm / destructive modals:** reuse `secrets-dialog-backdrop` + `about-dialog` shell; pair **Cancel** (secondary bordered) with a destructive action (e.g. **Choose file and replace…**) using `--danger` tint (see `.import-confirm-dialog-btn-danger` in `App.css`).
- **Inline tree editor** (`TreeInlineNameRow`): same input styling as the rest of the app; confirm control uses **success**-tinted green on hover; colon errors use **`.tree-inline-colon-err`** (`--danger`, small type).

---

## 8. Screenshots and marketing

- **README hero screenshot:** `docs/screenshot-main.png`. Update when the **default layout** meaningfully changes (so contributors and users see current UI). Prefer **PNG**, reasonable width (README uses a fixed display width).

---

## 9. For contributors and agents

- **Extend** `src/App.css` with new classes; **reuse** `:root` tokens before adding new colors.
- **Document** new global tokens or layout rules **here** and in **`AGENTS.md`** when behavior or structure of the design system changes.
- **Avoid** introducing a second accent color family or a separate spacing scale without updating this file and the variables in `App.css`.
