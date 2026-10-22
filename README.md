# PAC / ORACLE v1.2

A bilingual Persian (RTL) and English (LTR) fortune experience inspired by Tupac's music. The site uses plain HTML, CSS, and JavaScript, with no backend, build step, or dependencies.

Live site: [PAC / ORACLE](https://thelouismahdi.github.io/pac-oracle/).

## Run locally

Serve the repository root over HTTP so the database, locale files, and image index can load:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/`. Use the FA/EN menu to change language, or open `http://localhost:8000/?lang=en&f=500` for an English shared fortune. GitHub Pages publishes the `main` branch from `/` with the same static files. Custom web fonts use system fallbacks when unavailable.

## Bilingual archive and eligibility

- The original Persian database retains **501 unique records** and its source, review, and eligibility metadata.
- **491 fortunes are selectable in both languages**: 346 song-context drafts and 145 title-inspired drafts.
- All **501 records have English descriptive content** in `locales/en.json`. Every eligible record has an English headline, fortune, history, and details; no eligible English entry falls back to Persian.
- Nine alternate versions (430, 434, 438, 446, 452, 454, 470, 472, 476) remain indexed and ineligible.
- Reference-only entry 501 remains ineligible and has no fortune in either language. Its English translation covers the existing descriptive content only.

Selection still requires `public_eligible` and `random_eligible`, a valid ID and song title, and nonempty fortune/history. It uses the existing `crypto.getRandomValues()` picker and avoids the last 20 draws, using session memory if local storage is blocked. English uses the same 491-entry pool.

The archive is an editorial collection, not 501 independently verified recordings. Title-inspired interpretations remain distinct from verified song analysis. Translations preserve source uncertainty and do not resolve historical review flags. Fortune texts are independent interpretations, not official Tupac quotations.

## PAC REVEAL

An accepted draw selects exactly one fortune before displaying a **1050 ms** sequence:

1. 0–180 ms: dim the scene and introduce the archive branding.
2. 180–750 ms: move a CSS vinyl record and sleeve while cycling through real available song titles.
3. 750–1050 ms: show the actual selected title and uncover the existing printed fortune sheet.

The five displayed titles are decorative; they never call the picker or update recent history. Duplicate actions are rejected before selection. The original design, record data, images, and random algorithm are preserved.

With `prefers-reduced-motion: reduce`, a draw displays the result immediately. Decorative elements are hidden from assistive technology, and focus moves to the result heading after completion. Initial loads, shared URLs, browser navigation, saved-fortune reopening, and language changes do not run the sequence. Navigation, language changes, dialogs, page exit, and render errors cancel pending reveal timers and restore the controls.

## Existing features

- Save and reopen one favorite locally; copy the localized fortune and its share URL.
- Generate a 1080 × 1920 PNG with a mobile story preview, download, and native sharing where supported.
- Rotate curated archival portraits and textures using the existing 28-entry image index and bundled fallbacks. Asset provenance remains in `CREDITS_AND_RIGHTS.md` and the image index.
- Read existing source links and details. YouTube Music and Spotify links are **search/discovery links**, not verified direct recording URLs. Records without those links remain unchanged.
- Use FA/EN switching, keyboard-accessible dialogs, and browser Back/Forward navigation.

Social metadata uses the absolute published collage URL. Social previews are static; per-fortune server-rendered previews are not implemented. No audio or lyric transcription is included.

## Verify

Node's built-in test runner requires no package installation:

```sh
node --test tests/verify.cjs
```

The 16 tests cover archive integrity against baseline commit `306562ff0ec12e7c4f1c79e2b38e73f0c1b07955`, preservation of the previous 360 translations, all 491 results in both languages, reveal timing, rapid activation, reduced motion, interruption and error cleanup, asynchronous language changes, routing, saving, recent-history avoidance, copy text, and share-image text. A small DOM/clock/canvas fixture executes the actual application code; it does not replace browser layout checks.

Manual Chromium checks used the local HTTP site at 320, 360, 390, 430, 768, and 1440 px in both languages. First and subsequent draws, title matching, focus restoration, and horizontal overflow passed. Direct English chapter 500, saved-fortune reopening, language switching, Back/Forward interruption, and a real 1080 × 1920 story preview were checked. No browser console errors were observed. Clipboard content and canvas text are asserted by automated tests; the browser displayed the copy-success notification, but the browser tool's clipboard readback was empty. Reduced motion was tested with controlled `matchMedia`, not an operating-system setting. Physical devices, Safari, native share targets, and external music playback were not tested.
