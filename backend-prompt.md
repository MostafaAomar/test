# PROMPT: Add a Backend + Fix YouTube Player Lifecycle + Improve Teacher Editing in "Rafeeq Interactive Flipbook"

**Project files to attach:**
- `index.html` — teacher source.
- `student-book.html` — sample exported student book.
- Latest updated project ZIP, including the YouTube feature and previous UI fixes.

**IMPORTANT:** Read the actual attached files before implementation. Do not assume that previous changes were correctly integrated.

---

# 0. YOUR ROLE AND MOST IMPORTANT RULE

You are a senior full-stack engineer specializing in interactive educational applications.

Your task is to:
1. Add a backend so teachers can receive students' answers.
2. Fix the YouTube player restarting whenever a student answers a question.
3. Improve the teacher editing experience for YouTube activities, input fields, and MCQ dragging.
4. Preserve all other existing features.

## Change policy

This is an additive project update, with four explicitly authorized UI/behavior fixes described in Section 1.

**Do not redesign the application.**

Do not unnecessarily change:
- Existing visual design.
- Page layout.
- CSS styling.
- Existing DOM IDs and classes.
- Pinch zoom, pan, page-turn gestures, and drawing.
- Existing activity types or their answer logic.
- LocalStorage behavior.
- Student book export/import behavior.

The four authorized changes are:
- YouTube player lifecycle and visibility.
- Light green teacher-editable input backgrounds.
- MCQ drag positioning.
- YouTube window editing controls.

Everything else must remain functionally identical.

If no backend is configured, the student book must continue working offline exactly as before, with answers saved in `localStorage`.

Before coding:

1. Read all attached files fully.
2. Understand the current implementation and how the latest YouTube feature was integrated.
3. Identify the exact causes of the reported problems.
4. Provide a short architecture summary and implementation plan.
5. Implement in small steps.
6. Show the diff for every modified existing file.
7. Test before delivering.

Do not claim a feature is fixed unless it has actually been tested.

---

# 1. NEW UI FIXES AND YOUTUBE REQUIREMENTS

These changes are explicitly authorized.

## 1.1 CRITICAL: YouTube must never restart when a student answers a question

**Current bug:**

When a student is watching a YouTube video and answers any question on the page, the video reloads automatically from the beginning.

This is unacceptable.

Likely causes include:
- Rebuilding the entire activity overlay after saving an answer.
- Calling `renderPins()` or an equivalent rendering function.
- Recreating the YouTube iframe.
- Reassigning the iframe `src`.
- Replacing a parent container's `innerHTML`.
- Reinitializing the YouTube activity during unrelated answer updates.

You must inspect the actual code and identify the precise cause.

**Required behavior:**

The YouTube player must remain alive independently of the question-answer rendering system.

Implement the following rules:

1. Saving a fill-in-the-blank answer must NOT reload the video.
2. Selecting an MCQ answer must NOT reload the video.
3. Drawing a matching line must NOT reload the video.
4. Saving handwriting must NOT reload the video.
5. Checking an answer must NOT reload the video.
6. Navigating between unrelated activities on the same page must NOT reload the video.
7. Zooming, panning, and resizing the flipbook must NOT reload the video.
8. Updating the student's answer in LocalStorage must NOT reload the video.
9. Backend synchronization must NOT reload the video.

**Technical implementation:**

- Create the YouTube iframe once when the video activity is first opened.
- Keep a stable reference to its DOM element.
- Do not recreate it during activity rendering.
- Do not replace its parent container using `innerHTML`.
- Do not assign a new iframe `src` unless the teacher explicitly changes the video URL.
- Separate video rendering from `renderPins()` and all answer-rendering functions.
- Use stable activity IDs to identify video windows.
- Preserve the iframe DOM node across unrelated application updates.
- If the window moves or resizes, change only its position and dimensions.
- If the student closes the video, stop playback without destroying the ability to reopen it.
- Reopening the same video must not unnecessarily restart it.

If YouTube IFrame Player API is used, maintain the player instance and its state instead of recreating the player.

**Important:** Do not use a full-page rerender as a shortcut for updating answers.

The player must also remain stable during:
- `bookpageschange`
- `rf-layout`
- `rf-zoomend`
- Window resize.
- Mobile keyboard appearance.
- Student answer updates.
- Backend synchronization.

When navigating away from the page, follow a clearly defined lifecycle policy. Do not accidentally reset the player simply because an unrelated event fired.

## 1.2 YouTube teacher controls

The teacher can add YouTube video activities to a page.

The teacher must be able to:

- Paste a YouTube URL.
- Move the video window by dragging its title bar.
- Resize it using the bottom-right resize handle.
- Edit the YouTube URL.
- Hide the video window.
- Reopen a hidden video.
- Permanently delete the video activity.

The window must support normal YouTube playback controls.

**Student behavior:**

Students must see the video directly inside the book.

Students must not see:
- Teacher edit controls.
- Delete buttons.
- URL editing controls.
- Resize handles.
- Teacher-only configuration buttons.

Students can watch the video and use its normal playback controls.

### Hide versus delete

These are two different actions:

**Hide:**
- Hides the video window.
- Stops playback.
- Preserves the activity.
- Shows a small `▶ فيديو الدرس` button.
- Clicking that button reopens the same video.
- Preserve its saved position and size.

**Delete:**
- Permanently removes the video activity.
- Removes its saved configuration.
- Removes it from the exported student book after the next export.

Do not confuse hiding a video with deleting it.

## 1.3 Input fields: pale green background

Teacher-editable answer fields and placeholders must have a subtle pale green background.

The purpose is to make editable areas immediately recognizable.

Requirements:
- Use a soft, light green background.
- Maintain readable text contrast.
- Preserve the existing input dimensions.
- Preserve existing borders, radius, and positioning unless a small adjustment is essential.
- Do not make the background too dark.
- Do not change student answer validation or keyboard behavior.

Example color direction: `#e9f7e9` or a similar subtle green.

## 1.4 Fix MCQ dragging: no jumping

**Current bug:**

When the teacher drags an MCQ button or marker, it jumps to the right instead of staying under the pointer.

Likely cause:
- Incorrect coordinate conversion.
- Switching between `position:absolute` and `position:fixed`.
- Mixing screen coordinates and page-relative coordinates.
- Incorrect calculation when the flipbook is zoomed or transformed.

You must inspect the actual drag implementation.

**Required behavior:**

- The MCQ element must start dragging exactly where the teacher clicks it.
- It must remain under the pointer throughout dragging.
- It must not jump horizontally or vertically.
- Its position must be calculated relative to the page or activity overlay.
- Account for the flipbook's current zoom and translation.
- Preserve accurate positions when zoomed.
- Save the final coordinates correctly.
- Reloading the book must restore the same position.

Use Pointer Events where appropriate, with a consistent coordinate system.

Do not use fixed screen coordinates for elements positioned relative to the book page.

Test:
- Mouse dragging.
- Touch dragging.
- Dragging at 100% zoom.
- Dragging at 200% zoom.
- Dragging near page edges.

Do not modify the matching-line gesture system.

---

# 2. WHAT THE APP IS

A single-file, offline-capable interactive flipbook for school students (Grade 1 English, Emar series).

Pages are JPG images or embedded base64 images in the exported file.

Teachers add interactive activities on top of pages. Students solve them directly on the page.

Two main files:

| File | Purpose |
|---|---|
| `index.html` | Teacher application |
| `student-book.html` | Exported student application |

`index.html` includes:
- Teacher Mode.
- PDF upload using pdf.js.
- Activity creation and editing.
- Activity import/export.
- Student book export.
- Page image loading from `pages/p-001.jpg` and similar files.

The student book is generated from the teacher application.

Teacher controls are hidden in the exported version.

Do not change the export architecture without a strong technical reason.

---

# 3. HOW STUDENT BOOK EXPORT WORKS

The existing `#rf-export-book` function uses:

`document.documentElement.outerHTML`

It removes the pdf.js script and injects student data before the first occurrence of the exact marker:

`<script>\n(function(){`

The injected data currently includes:

- `RF_PAGE_DATA`
- `RF_ACTIVITIES`
- `RF_DRAWINGS`
- `RF_MATCH_ANSWERS`
- `RF_WRITING_DRAWINGS`
- `RF_CHOICE_ANSWERS`
- `RF_FILL_ANSWERS`
- `RF_TEXT_ANSWERS`

Keep the marker unique and preserve its position.

Add backend configuration to the injected data script:

`window.RF_BACKEND={...};`

Ensure the YouTube activities are also included in `RF_ACTIVITIES`.

Their URLs, positions, dimensions, visibility configuration, and stable IDs must survive export.

The exported student book must display the video correctly without requiring Teacher Mode.

Do not export teacher editing controls as visible student controls.

---

# 4. EXISTING SCRIPTS

The application has three main inline scripts, in this order.

## Script 1: Main IIFE

Contains:
- Activities.
- Teacher tools.
- Rendering of pins and inputs.
- Matching, choice, and writing activities.
- Answer storage.
- Speech.
- Export/import.

## Script 2: Flipbook IIFE

Contains:
- Single-page flipbook.
- Page-turn animation using `#fx` canvas.
- Corner dragging.
- Previous/next navigation.
- Information and slider controls.
- Keyboard arrows.
- `bookpageschange` event.

## Script 3: Viewer IIFE

Contains:
- Full-screen viewer.
- Pinch/wheel zoom.
- Pan.
- `#rf-wrap` transform.
- `window.RF_VIEW={scale,tx,ty}`.
- Right dock `#rf-dock`.
- Close button `#rf-close`.
- Keyboard handling.
- `visualViewport`.
- Toast through `#rf-status`.
- `rf-layout` and `rf-zoomend` events.

**Critical:** Do not combine these scripts into one new rendering system.

Add isolated code wherever possible.

The YouTube lifecycle must be independent of all three scripts' unrelated rendering operations.

---

# 5. DATA MODEL

Everything is currently stored in LocalStorage and preloaded from `window.RF_*`.

Existing keys:

| LocalStorage key | Preload |
|---|---|
| `rafeeq.flipbook.activities.v1` | `RF_ACTIVITIES` |
| `rafeeq.flipbook.fill-answers.v1` | `RF_FILL_ANSWERS` |
| `rafeeq.flipbook.choice-answers.v1` | `RF_CHOICE_ANSWERS` |
| `rafeeq.flipbook.match-answers.v1` | `RF_MATCH_ANSWERS` |
| `rafeeq.flipbook.text-answers.v1` | `RF_TEXT_ANSWERS` |
| `rafeeq.flipbook.writing-drawings.v1` | `RF_WRITING_DRAWINGS` |
| `rafeeq.flipbook.drawings.v1` | `RF_DRAWINGS` |

Inspect the real code for the exact answer shapes before implementing synchronization.

Existing activity types include:

`listen`, `read`, `choice`, `fill`, `write`, `match`.

Add:

`youtube`

The YouTube activity should have a stable ID and appropriate configuration fields.

Suggested structure:

- `id`
- `page`
- `type: 'youtube'`
- `url`
- `videoId`
- `x`
- `y`
- `width`
- `height`
- `hidden`

Use the existing activity storage and export mechanism.

Do not create an unnecessary second storage system for teacher activities.

---

# 6. BACKEND REQUIREMENTS

## 6.1 Student identity

No accounts for children.

Teacher creates:
- Class code.
- Book ID.

Student opens:

`student-book.html?class=ABC123`

Student enters only a first name or selects a name from a teacher-provided list.

Show a small themed modal only when:
- `window.RF_BACKEND` exists.
- No student identity is already stored.

Store:

`rafeeq.flipbook.student.v1`

Suggested shape:

`{studentId, name}`

Collect minimal personal information.

No email, phone, or photos.

Include GDPR/COPPA-style data retention and deletion guidance.

## 6.2 Answer synchronization

Write-only student submission API.

Hook existing save functions without rewriting their logic:

- `saveFillAnswers`
- `saveChoiceAnswers`
- `saveMatchAnswers`
- `saveTextAnswers`
- `saveWritingDrawings`
- `saveDrawings`

After successful saves, submit a debounced request (approximately 1.5 seconds):

`POST /api/submissions`

Payload:

`{classCode, bookId, studentId, activityId|pageNumber, type, payload, clientTimestamp}`

Idempotent upsert by student and activity, with last-write-wins behavior.

**Important:**

Backend synchronization must not:
- Re-render the page.
- Recreate activities.
- Recreate the YouTube iframe.
- Change the iframe URL.
- Interrupt video playback.

## 6.3 Offline queue

If requests fail:
- Save them in `rafeeq.flipbook.outbox.v1`.
- Retry on the `online` event.
- Retry periodically every 30 seconds.
- Use exponential backoff.

Never block the interface.

Never throw uncaught errors.

Never use alerts, confirms, or prompts in student mode.

Use the existing `status(text)` toast for short messages.

## 6.4 Teacher dashboard

Create a new separate page:

`teacher-dashboard.html`

Do not redesign the book interface.

Features:
- Teacher login.
- Email/password authentication.
- JWT/session.
- Manage classes.
- Generate class codes.
- List students.
- View student results.
- View activity results.
- Correct/wrong/not answered status.
- Fill-in values.
- Selected MCQ options.
- Matching lines overlaid on the original page image.
- Handwriting and drawing rendered from stroke data.
- Last activity time.
- Filter by class and page.
- CSV export.
- Delete a student's data.

Arabic RTL interface.

Use the existing application's visual direction:
- Navy gradient `#4b4f7a → #17182e`.
- Blue `#2d6cdf`.
- Green `#16a34a`.
- Red `#e5384b`.
- Rounded glass panels.

---

# 7. TEACHER PUBLISHING

In Teacher Mode, the existing `تصدير كتاب الطالب` must support embedding:

`window.RF_BACKEND={url,bookId,classCode,publicKey}`

Add the smallest possible configuration UI.

Prefer a small settings section inside `#rf-teacher-bar` using `data-teacher-only`.

Alternatively, read configuration from constants in the isolated script if this is safer.

No secrets in exported HTML.

Only public keys and class codes may be exposed.

---

# 8. SECURITY

- Validate every incoming payload.
- Maximum request size approximately 1 MB.
- Compress or simplify large stroke arrays.
- Rate-limit per IP and student.
- CORS allow-list.
- Parameterized queries.
- Teacher routes require authentication.
- Row Level Security.
- Students can only insert/update their own records.
- Students cannot read other students' data.
- Never expose service-role keys in the browser.

---

# 9. STACK

Prefer Supabase.

Use:
- PostgreSQL.
- Supabase Auth.
- Row Level Security.
- Edge Functions.

Alternative: Node.js + Express + PostgreSQL/SQLite.

The frontend must remain static and GitHub Pages compatible.

Explain the chosen architecture in three lines.

Provide copy-paste setup instructions.

---

# 10. SUGGESTED DATABASE TABLES

- `teachers`
- `classes(code, teacher_id, book_id)`
- `students(id, class_id, display_name, created_at)`
- `submissions(student_id, activity_id, page, type, payload jsonb, correct bool null, updated_at)`
- `page_drawings(student_id, page, strokes jsonb)`

Use a unique constraint for student/activity submissions.

Design the schema so page drawings can be updated safely.

---

# 11. REGRESSION TESTING: MUST PASS

Test every item.

## A. YouTube player lifecycle

This is a mandatory high-priority test.

1. Open a student book.
2. Start a YouTube video.
3. Allow it to play for at least 10 seconds.
4. Answer a fill-in-the-blank question.
5. Confirm the video continues from its current playback position.
6. Select an MCQ answer.
7. Confirm the video continues.
8. Draw a matching line.
9. Confirm the video continues.
10. Save handwriting.
11. Confirm the video continues.
12. Zoom and pan.
13. Confirm the video continues.
14. Trigger backend synchronization.
15. Confirm the video continues.

**Success condition:** The video must not restart from zero or show a loading screen during unrelated answer operations.

Instrument the iframe/player lifecycle in automated tests. Verify that the iframe DOM node remains the same and its `src` is not reassigned.

Test hiding and reopening separately.

Changing the URL should load the new video.

Deleting the activity should remove it.

## B. Input fields

- Pale green background.
- Readable text.
- Correct dimensions.
- Phone keyboard stays open.
- Enter moves to the next blank.
- Last blank checks answers.
- Green/red answer feedback.

Never call `renderPins()` while an input is focused or on a plain resize event.

This was the cause of an old mobile keyboard bug.

## C. MCQ dragging

Test:
- No horizontal jumping.
- No vertical jumping.
- Accurate pointer tracking.
- Mouse and touch.
- 100%, 200%, and 300% zoom.
- Correct saved coordinates.
- Correct restoration after reload.

## D. Zoom and drawing

- Pinch zoom 60%–600%.
- One-finger pan while zoomed.
- Mouse-wheel/Ctrl+wheel zoom.
- Zoom buttons.
- Fit button.
- Drawing canvases use `clientWidth` and `clientHeight`, not `getBoundingClientRect()`.

Never change this because strokes drift when zoomed.

## E. Matching

- Free line from dot to dot.
- Preview line blue.
- Saved correct lines green.
- Saved wrong lines red.
- Correct saved coordinates.

The icon SVG rule is scoped to:

`#rf-dock svg, #rf-close svg, #rf-dock-toggle svg`

Never use a broad `svg {}` rule.

## F. Existing viewer

- Right-side dock.
- Zoom.
- Previous/next.
- Page counter and slider.
- Draw/undo/clear.
- Red close button.
- Teacher bar hidden in student export.
- Page turn by corner drag at 100% zoom.
- Arrow keys ignored while typing.

## G. Backend

- Answer submitted to database within 5 seconds.
- Offline answer queued.
- Answer delivered after reconnect.
- Two students cannot read each other's records.
- Teacher can view submissions.
- CSV export works.
- Student deletion works.

## H. Offline

Open the student book without internet and without backend configuration.

Everything must work as before.

No new console errors.

No `alert`, `confirm`, or `prompt` in student mode.

---

# 12. ERROR GLOSSARY

- `favicon.ico` 404: already addressed with inline favicon.
- `pages/p-00X.jpg` 404: check the missing pages folder.
- Chrome extension WebSocket errors: test in incognito.
- LocalStorage quota errors: show the existing storage error toast.
- Exported answers missing: check that injected data appears before the first main script marker.
- YouTube Error 153: inspect HTTP Referer behavior, embedding restrictions, browser context, and hosting. Do not assume changing the iframe URL alone fixes it.
- YouTube restarting after an answer: inspect DOM replacement, iframe recreation, `src` reassignment, and parent `innerHTML` updates.
- MCQ jumping: inspect coordinate conversion, transformed parent elements, and position mode changes.

---

# 13. AUTOMATED TESTS

Use Playwright with mobile emulation:

`390 × 844`, touch enabled.

Cover:
- Existing viewer functionality.
- All activity types.
- Input keyboard behavior.
- MCQ dragging.
- YouTube playback lifecycle.
- Video hide/reopen.
- Video resizing and movement.
- Student export.
- Backend synchronization.
- Offline queue.
- Student data isolation.

For YouTube testing, use a test video that permits embedding.

If browser automation cannot verify actual YouTube playback due to external restrictions, explicitly report that limitation. Do not claim playback was verified based only on iframe creation.

---

# 14. DELIVERABLES

Provide:

1. Architecture summary.
2. Three-line stack justification.
3. Database SQL.
4. RLS policies.
5. API/Edge Function code.
6. Environment variables.
7. Isolated frontend backend script.
8. Minimal changes to `index.html`.
9. Updated `student-book.html` export behavior.
10. `teacher-dashboard.html`.
11. YouTube lifecycle fix.
12. Pale green input styling.
13. MCQ dragging fix.
14. Setup and deployment guide in Arabic and English.
15. Playwright automated test script.
16. A complete updated ZIP project.
17. A detailed diff for modified existing files.
18. A regression test report.
19. A list of existing functionality and design that was deliberately left unchanged.

---

# 15. FINAL DEVELOPMENT RULES

Before finishing, verify these points:

- Do not recreate the YouTube iframe when saving answers.
- Do not reload YouTube when changing unrelated activities.
- Do not accidentally delete hidden videos.
- Do not confuse hide and delete.
- Do not let the MCQ jump when dragged.
- Do not make input fields difficult to recognize.
- Do not close the mobile keyboard unexpectedly.
- Do not break existing activities.
- Do not break student book export.
- Do not break offline functionality.
- Do not introduce new popups.
- Do not expose backend secrets.
- Do not silently remove existing features.

**Most important acceptance criterion:**

A student must be able to watch a YouTube video while answering questions on the same page, and the video must continue playing uninterrupted while answers are saved locally and synchronized with the backend.

The application must feel like one stable interactive learning environment, not a collection of components that reload every time the student interacts with something.

If an existing implementation conflicts with these requirements, explain the conflict and propose the smallest safe fix before changing it.
