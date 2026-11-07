# Forkcast: progress

Personal calorie and macro tracker in the style of Cronometer, used on an Android phone as a home screen web app.
Plain HTML/CSS/JS, no build step, no backend. Live at https://munteanuvladislav2007-byte.github.io/forkcast/
(GitHub Pages, public repo `munteanuvladislav2007-byte/forkcast`, files at the repo root).

## Files

- `index.html`: all markup, including every sheet (`<dialog class="sheet">`): add, food, recipe, batch, yield, custom, settings.
- `app.js` (~1,560 lines, one ES module). Sections, in order: State, Dates, Nutrition math, Diary render, Sheets,
  Add sheet & tabs, USDA, Open Food Facts, Search tab, Barcode tab, Food detail sheet, Favorites, Drag,
  Premade meals, Cooked batches, Cooked foods (yield library), Containers, Custom food, From Claude, Settings/Macro split, Wiring.
- `styles.css`: color tokens on `:root` with dark-mode overrides; fonts Bricolage Grotesque + Figtree.
- `sw.js`: network-first service worker. **Bump `CACHE` (`forkcast-vN`, now v9) on every release.**
- `manifest.webmanifest`, `icon.svg`: installable app.
- `CLAUDE_PROJECT_INSTRUCTIONS.md`: instructions the user pasted into a Claude Project that estimates meals from photos.
- `README.md`: user-facing setup.

## Data

Everything lives in `localStorage["forkcast.v1"]` (object `S`), per device. Export/Import JSON in Settings covers all of it.
- `settings`: `targets` {kcal, split {protein, carbs, fat} percents summing to 100, gram goals derived}, `usdaKey` (default DEMO_KEY).
- `log[YYYY-MM-DD]`: entries {id, meal, food (full snapshot), grams, at}. Meals: Unsorted, Breakfast, Lunch, Dinner, Snacks.
- Foods are {id, name, brand, source, per100 {kcal, protein, carbs, fat, fiber, sugar, sodium mg}, servings [{label, grams}], code?}.
  Sources: USDA, USDA Branded, Open Food Facts, Custom, AI estimate, My meal, Batch, Cooked. Combined foods carry `parts` [{food, grams}].
- `recents` (40), `favorites`, `customFoods` (permanent; barcode lookup checks these first), `recipes` (premade meals),
  `batches`, `containers` {name, tare}, `yields` (keyed by raw food id: {food, samples [{raw, cooked, at, batchId?}]}),
  `collapsed` (folded meal sections), `combineClaude` (last checkbox choice), `lastAmounts` (food id -> last unit/amount).

## Features (all done and live)

- Diary: date navigation, calorie ring, macro bars, meal sections that fold, drag entries between meals by the grip handle.
- Add sheet tabs: Search (USDA + custom foods; OFF text search is attempted but usually blocked by CORS), Barcode
  (BarcodeDetector or ZXing camera, photo, or typed; custom foods -> Open Food Facts -> USDA Branded), From Claude.
- Lists under search: Recent, Favorites, My meals, Cooking, History (last 30 days, re-add).
- From Claude: user sends a photo to a Claude Project, copies the `FORKCAST {json}` block, pastes; review items, edit grams,
  untick, optionally combine into one entry (unfolds on the diary, can be split back). No API key; uses the user's subscription.
- Premade meals: ingredients via the same add sheet in "pick mode"; log as one entry with parts.
- Cooked batches: raw ingredients + cooked weight (scale reading minus container tare), grams left = cooked minus logged.
- Cooked foods: batches that are >=90% one food record raw->cooked factor; average of last 6, with spread; manual samples.
  Per 100 g cooked = raw per 100 g / factor. Excludes oil etc., which the user logs separately.
- Custom foods with barcode, editable (fixing a typo also updates logged entries), deletable.
- Macro targets as calories + percent split with sliders, presets; changing one percent rescales the other two.
- Food sheet reopens at the last amount/unit used for that food (not for batches, cooked foods, AI items).
- USDA requests retry up to 3 times (their server randomly returns 400); clear messages for 429 and 403.

## How to work on it

- Preview locally: `.claude/launch.json` runs `python -m http.server 5173`; test in the browser pane with
  `javascript_tool` scripts, then clear `localStorage` test data.
- Publish: `gh` is logged in as the user. Upload changed files with
  `gh api -X PUT repos/munteanuvladislav2007-byte/forkcast/contents/<file>` (base64 content + current sha), then wait for
  the Pages build and check the live file. Compare with `cmp`, not `git hash-object` (Windows CRLF normalization).
- Phones can keep the old version ~10 minutes (GitHub cache headers); tell the user to reopen the app.

## Decisions and gotchas

- Claude API photo estimates were removed on purpose (per-photo cost); paste-from-Claude replaced them.
- `closeSheet()` calls `onAddClosed()` directly because dialog `close` events weren't reliable; pick mode returns to the editor.
- `setTab` must only touch `#addSheet .tab-panel` (an earlier bug blanked other sheets).
- Not done (user said "not now"): make the service worker fetch with `cache: "no-cache"` so updates show immediately.

## Ideas not started

- Weekly averages / charts, water tracking, copying a whole day.
