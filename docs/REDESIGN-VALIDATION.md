# September 12 redesign verification

The app keeps the original wordmark and grouped navigation, adds the poster-inspired home/library and calm mixed-page editors, and removes inactive social/onboarding destinations from the active product.

## Checks

- Production Next.js compile, TypeScript validation, and static export passed.
- `npm test`: 41 passed, 0 failed. Includes overlay history, delayed realtime invalidation, suspended focus timer, mixed page encoding, PDF margin coordinates, and canvas geometry.
- Browser sizes inspected: 390 × 844, 1024 × 1366, 1440 × 900, and the actual 1910 × 855 viewport, across dark/light themes.
- Native browser Back dismissed board text editing, then selection, then returned to notebook pages. Overlay history regression tests cover nested dismissal and route transitions.
- PDF import rendered a test page with an editable note in its outer margin. Checklist completion, flashcard question/reveal/finish, and focus timer persistence across reload were exercised.
- On-device photo removal produced a transparent object cutout, which appeared on its notebook cover and survived reload. An image without a clear subject returned the supported retry/full-photo state. The model runs in a cancellable worker.
- The independent visual reviewer scored seven requested corrections resolved: overdue truth, blue actions, deadline clarity, light-theme contrast, jar hierarchy, camera heading, and mobile arrow contrast. This verdict covers those corrections.

## Remaining validation boundaries

- Preview fixtures use synthetic IDs and intentionally cannot prove authenticated Supabase writes. Invalid fixture-ID saves were visibly reported; no successful cloud-save claim is made from these tests.
- Camera hardware, physical mouse side-button delivery, Android APK/WebView performance, Xiaomi stylus pressure/palm behavior, and authenticated cross-device asset sync require device/session validation. Native browser history was exercised through the browser control API.
- Cutout inference is free per image but initially downloads roughly 220 MB of model/runtime assets. Browser cache eviction can require another download. A supported browser and sufficient memory are required; the original full-photo option remains available.
- Existing note save behavior remains debounced upsert with visible errors and no rollback. A preview check is not proof of recovery after a failed server write and browser storage loss.
