UniQuiz Offline - deployment and use
=====================================

1. Upload every file in this folder to the same GitHub Pages/site directory.
2. Open the deployed HTTPS page once while connected to the internet.
3. Press Download beside only the year the student wants (First Year, Second Year, etc.).
4. After the success message, that year and the application design work offline.
5. Press Update only when the student wants to check that downloaded year for changes.
   Unchanged subject files are not downloaded again.
6. Press Remove to delete a year's offline question data. Quiz progress is kept.

Important:
- Offline mode requires HTTPS hosting (GitHub Pages is suitable). Service workers do
  not work when index.html is opened directly as a file from the computer.
- Keep index.html, app.js, style.css, offline.css, service-worker.js,
  manifest.webmanifest, and icon.svg together.
- Progress and downloaded years are stored in the browser on that device.
- App/code updates on the same website do not erase the saved progress.
