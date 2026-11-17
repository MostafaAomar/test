# PROMPT: Add a backend to "Rafeeq Interactive Flipbook" (without changing the design or any existing function)

> Attach to this prompt: `index.html` (teacher source) and `student-book.html` (a sample exported student book).
> Language of the app UI: Arabic (RTL text inside LTR page) + English book content.

---

## 0. YOUR ROLE AND THE ONE RULE THAT MATTERS MOST

You are a senior full-stack engineer. Add a backend so a teacher can receive students' answers directly.

**HARD RULE: this is an ADDITIVE change.** Do NOT change the visual design, the layout, the CSS, the DOM ids/classes, the gestures (pinch-zoom, pan, page turn, drawing), or the behaviour of any existing activity type. If a student has no internet or no backend is configured, the book must behave **exactly** as it does today (answers saved only in `localStorage`).
Any new code must be isolated (a new `<script>` block placed after the existing ones, or a new file) and must be disabled unless a config object `window.RF_BACKEND` exists.

Before writing code: (1) read both files fully, (2) reply with a short summary of how you understand the app and a step-by-step plan, (3) then implement in small steps and show me the diff of every change to existing files.

---

## 1. WHAT THE APP IS

A single-file, offline-capable interactive flipbook for school students (Grade 1 English, Emar series). Pages are JPG images (or embedded base64 in the exported file). Teachers add interactive activities on top of pages; students solve them directly on the page.

**Two files, one codebase:**

| File | Who uses it | Notes |
|---|---|---|
| `index.html` | Teacher | Full app. Has "Teacher Mode" (button `#rf-mode`) to upload a PDF (pdf.js from cdnjs), add/edit activities, export/import activities JSON, and **export the student book**. Pages are loaded from `pages/p-001.jpg ...` |
| `student-book.html` | Students | A generated copy of `index.html` with data injected. Teacher UI is hidden. |

**How the student book is generated (very important – do not break it):**
`index.html` function behind `#rf-export-book` takes `document.documentElement.outerHTML`, removes the pdf.js `<script src>`, and injects, **before the first occurrence of the exact string `<script>\n(function(){`**, this data script:

```
<script>window.RF_PAGE_DATA=[...base64 jpg strings...];
window.RF_ACTIVITIES=[...];window.RF_DRAWINGS={};window.RF_MATCH_ANSWERS={};
window.RF_WRITING_DRAWINGS={};window.RF_CHOICE_ANSWERS={};window.RF_FILL_ANSWERS={};
window.RF_TEXT_ANSWERS={};</script>
<style>#rf-teacher-bar,#rf-mode,#rf-add,#rf-pdf,#rf-export-book,#rf-export,#rf-import,#rf-file,[data-teacher-only]{display:none!important}#rf-panel{display:none!important}</style>
```
Keep that marker string unique and first. Your backend config must be injected the same way (e.g. `window.RF_BACKEND={...}`), as one extra statement in that data script.

## 2. SCRIPTS INSIDE THE HTML (3 inline scripts, in this order)

1. **Main IIFE** (`const $=id=>document.getElementById(id)...`): activities, teacher tools, rendering of pins/inputs/match/choice/writing, answer storage, speech, export.
2. **Flipbook IIFE**: single-page flipbook, page-turn animation on `#fx` canvas, corner drag to turn, `prev/next/info/scrub`, keyboard arrows. Fires `bookpageschange`.
3. **Viewer IIFE** (full-screen viewer): pinch/wheel zoom + pan on `#rf-wrap` (transform), global `window.RF_VIEW={scale,tx,ty}`, right dock `#rf-dock`, close button `#rf-close`, keyboard handling via `visualViewport`, toast on `#rf-status`. Fires `rf-layout` and `rf-zoomend` events.

## 3. DATA MODEL (what you must sync)

Everything is persisted in `localStorage` (and preloaded from `window.RF_*` in the student book). Keys:

| localStorage key | window preload | Shape (verify in code) |
|---|---|---|
| `rafeeq.flipbook.activities.v1` | `RF_ACTIVITIES` | array of activities (teacher content – NOT student data) |
| `rafeeq.flipbook.fill-answers.v1` | `RF_FILL_ANSWERS` | `{ [activityId]: { values:[string], checked:bool, results:[bool], correct:bool } }` |
| `rafeeq.flipbook.choice-answers.v1` | `RF_CHOICE_ANSWERS` | `{ [activityId]: answer }` (inspect `saveChoiceAnswers` usage for exact shape) |
| `rafeeq.flipbook.match-answers.v1` | `RF_MATCH_ANSWERS` | `{ [activityId]: [ { from:int, to:int, correct:bool, path:[[x,y],...] } ] }` – x,y are 0..1 fractions of the page overlay (a free-hand line the student drew) |
| `rafeeq.flipbook.text-answers.v1` | `RF_TEXT_ANSWERS` | `{ [activityId]: ... }` (inspect) |
| `rafeeq.flipbook.writing-drawings.v1` | `RF_WRITING_DRAWINGS` | `{ [activityId]: [stroke,...] }` handwriting strokes in a writing box |
| `rafeeq.flipbook.drawings.v1` | `RF_DRAWINGS` | `{ [pageNumber]: [stroke,...] }` free drawing on the page ("ارسم" tool) |

Activity object (teacher content): `id, page (1-based), x, y (percent of page), type ('listen'|'read'|'choice'|'fill'|'write'|'match'), lang, label, prompt, text, options[], correct (index), blanks[] (correct answers), pairs[[a,b]], choicePoints[], audio, voiceURI, matchPoints[{left:{x,y},right:{x,y}}], blankBoxes[{x,y,width,height}]`.
The activity `id` (e.g. `a1794830700481`) is the stable key used by every answer store.

## 4. BACKEND REQUIREMENTS

1. **Student identity (no accounts for children).** The teacher creates a *class code* + *book id*. A student opens the student book via a link like `student-book.html?class=ABC123` and enters only a first name (or picks from a teacher-provided list). Show this as a tiny, themed modal ONLY when `window.RF_BACKEND` exists and no student is stored yet. Store `{studentId, name}` in `localStorage` (`rafeeq.flipbook.student.v1`). Collect the minimum personal data (children's privacy: no email, no phone, no photos; mention GDPR/COPPA-style retention and deletion).
2. **Sync (write-only from the student side).** After every successful answer save (hook the existing `saveFillAnswers / saveChoiceAnswers / saveMatchAnswers / saveTextAnswers / saveWritingDrawings / saveDrawings` – wrap them, do not rewrite them) send a debounced (≈1.5 s) `POST /api/submissions` containing `{classCode, bookId, studentId, activityId|pageNumber, type, payload, clientTimestamp}`. Idempotent upsert by `(studentId, activityId)`; last write wins.
3. **Offline queue.** If the request fails, keep it in `localStorage` (`rafeeq.flipbook.outbox.v1`), retry on `online` event and every 30 s with exponential back-off. Never block the UI, never throw, never show alerts/popups (the project rule is **NO POPUP BOXES** – use the existing `status(text)` toast only for short messages like "تم حفظ إجاباتك").
4. **Teacher side.** A NEW separate page `teacher-dashboard.html` (do not touch the book UI): login (email+password, JWT/session), manage classes and codes, list students, per-student and per-activity results (correct / wrong / not answered), fill values, chosen option, match lines drawn on top of the page image, handwriting/drawings rendered from stroke data, last activity time, filter by class/page, **CSV export**, delete a student's data. RTL Arabic UI consistent with the app's look (dark navy gradient `#4b4f7a → #17182e`, blue `#2d6cdf`, green `#16a34a`, red `#e5384b`, rounded glass panels).
5. **Teacher publishing.** In Teacher Mode only, the existing "تصدير كتاب الطالب" must also be able to embed `window.RF_BACKEND={url,bookId,classCode,publicKey}` into the export. Add the settings input as a `data-teacher-only` element in `#rf-teacher-bar` (same style as the other buttons) or read it from constants at the top of the new script – whichever changes the existing UI least.
6. **Security.** Validate and size-limit every payload (stroke arrays can be large: cap at ~1 MB per request, compress/simplify strokes), rate-limit per IP + student, CORS allow-list, parameterised queries, no secrets in the exported HTML (only a public anon key / class code), teacher routes behind auth, row-level security so a student key can only INSERT/UPDATE its own rows and can never read others'.
7. **Stack.** Prefer the simplest thing a school teacher can maintain: **Supabase** (Postgres + Auth + Row Level Security + Edge Functions) or **Firebase**. Alternative: Node.js + Express + PostgreSQL/SQLite on a small VPS. Choose one, justify it in 3 lines, and give copy-paste setup steps (tables/SQL, env vars, deploy). Keep the front-end static (GitHub Pages compatible).
8. **Suggested tables:** `teachers`, `classes(code, teacher_id, book_id)`, `students(id, class_id, display_name, created_at)`, `submissions(student_id, activity_id, page, type, payload jsonb, correct bool null, updated_at)` with unique `(student_id, activity_id)`; `page_drawings(student_id, page, strokes jsonb)`.

## 5. THINGS THAT MUST KEEP WORKING (regression checklist – test them all)

- Typing in a blank (`.rf-blank-input`) on a phone: the keyboard must stay open. **Never call `renderPins()` while an input is focused or on a plain `resize` event** (the root cause of an old bug: the keyboard resize rebuilt the inputs and closed the keyboard). Enter moves to the next blank; leaving/Enter on the last blank checks the answers (green/red).
- Pinch zoom (60 %–600 %), one-finger pan when zoomed, mouse-wheel/Ctrl+wheel zoom, zoom buttons, fit button. Drawing/writing canvases use **layout size** (`clientWidth/Height`), not `getBoundingClientRect()` – do not change that, or strokes drift when zoomed.
- Matching: student drags a **free line** from a dot to a dot; preview line is blue, saved lines green (correct) / red (wrong). CSS note: the icon SVG rule is scoped to `#rf-dock svg, #rf-close svg, #rf-dock-toggle svg` – never use a broad `svg {}` rule, it breaks the matching lines.
- Right-side dock (zoom, prev/next, page counter + slider, draw/undo/clear), red close button `#rf-close`, teacher bar hidden in the student export.
- Page turn by corner drag at 100 % zoom only; arrow keys are ignored while typing.
- Offline: opening `student-book.html` with no network and no backend config works as before.
- No new console errors. No `alert/confirm/prompt` in student mode.

## 6. ERROR GLOSSARY (so you can diagnose without guessing)

- `Failed to load resource: 404` for `favicon.ico` → already fixed with an inline `<link rel="icon">`. A 404 for `pages/p-00X.jpg` means the `pages/` folder is missing next to `index.html`.
- `WebSocket connection to 'wss://c/Users/.../ws' failed` and `Cannot read properties of undefined (reading 'direction')` come from **browser extensions** injected into a page saved with Chrome "Save as" (look for `chrome-extension://` in the file). They are not app bugs. Test in an incognito window and never save the page from the browser; use the in-app export.
- `localStorage` quota errors → the app shows "تعذر الحفظ: حجم البيانات كبير". The backend must not depend on localStorage being able to hold everything.
- If answers do not show after export, check that the data `<script>` was injected before the first `<script>\n(function(){` marker.

## 7. DELIVERABLES

1. Short architecture summary + chosen stack (3 lines of justification).
2. Database schema/SQL, RLS policies, API/edge-function code, environment variables.
3. The new front-end script (isolated block or file) + the minimal diff to `index.html` for exporting `RF_BACKEND`.
4. `teacher-dashboard.html`.
5. Step-by-step deployment guide for a non-programmer teacher (Arabic + English).
6. An automated test script (Playwright with mobile emulation: 390×844, touch) covering section 5 plus: answer typed → appears in DB within 5 s; offline → queued → delivered after reconnect; two students cannot read each other's data.
7. A list of anything you were tempted to change in the existing design/functions but did NOT, and why.

If something is ambiguous, ask me ONE concise question first; otherwise make the safest assumption and state it.
