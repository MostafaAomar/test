UniQuiz Offline - deployment and use
=====================================

1. Upload every file in this folder to the same GitHub Pages/site directory.
2. Open the deployed HTTPS page once while connected to the internet.
3. Press Download beside only the year the student wants (First Year, Second Year, etc.).
4. After the success message, that year and the application design work offline.
5. After a year is downloaded, UniQuiz checks the repository while online.
   The Update button stays hidden unless a NEW subject JSON file is added to that year.
   When the student updates successfully, the alert disappears. Changes inside an
   existing subject file alone do not show the alert.
6. Press Remove to delete a year's offline question data. Quiz progress is kept.

Cross-device words and notes
----------------------------

1. Open "My Vocabulary" and press "تسجيل الدخول والمزامنة".
2. Enter the same GitHub username, repository name, and Personal Access Token on
   every device. The repository must already exist and the token needs permission
   to read and write repository contents.
3. UniQuiz creates/updates `uniquiz-user-data.json` in that repository. The token
   itself is never written into that data file.
4. Saved vocabulary and question notes are merged by their update time. Deletions
   are also remembered so removed entries do not reappear on another device.
5. Local use remains available without signing in. Signing out removes the token
   from that device but keeps its local words and notes.

Important:
- Offline mode requires HTTPS hosting (GitHub Pages is suitable). Service workers do
  not work when index.html is opened directly as a file from the computer.
- Keep index.html, app.js, style.css, offline.css, service-worker.js,
  manifest.webmanifest, and icon.svg together.
- Progress and downloaded years are stored in the browser on that device.
- Cross-device sync currently covers personal vocabulary and question notes.
  Quiz/study progress and downloaded year files remain device-local.
- App/code updates on the same website do not erase the saved progress.

Automatic updates
-----------------

- While online and open, the app checks once every minute for a new application shell
  and for changes inside every subject file of each downloaded year.
- Added or changed questions are downloaded silently. Saved quiz/study progress
  and question notes remain attached to their stable question IDs.
- Browsers that support Periodic Background Sync may refresh the application
  shell while the installed PWA is closed. All other browsers run the same check
  when the app opens, becomes visible, or reconnects to the internet.
- After deploying this version, replace every file once and reopen/refresh the
  app so cache version v7 becomes active. Future releases no longer require the
  student to clear browser storage manually.
- To change the interval later, edit `AUTOMATIC_UPDATE_INTERVAL_MS` near the top
  of app.js. For 24 hours, use `24 * 60 * 60 * 1000`.
