# PAC / ORACLE v1.1

A responsive Persian (RTL) fortune experience inspired by the music of 2Pac. Plain HTML, CSS, and JavaScript, no backend or build dependencies.

## Open

- **On a phone:** open `PAC_ORACLE_v1.1_MOBILE_ONE_FILE.html` in a browser. It embeds the HTML, CSS, JavaScript, images, and the 501-record archive. No server is required. Custom web fonts may require connectivity; system font fallbacks are provided.
- **For development and GitHub Pages:** unzip `PAC_ORACLE_WEBSITE_v1.1.zip`, then from `PAC_ORACLE_SITE` run `python -m http.server 8000`. Visit `http://localhost:8000`.

## Changes from v1.0

- Responsive fortune card with improved mobile typography and actions directly below the fortune.
- Full-length story PNG preview (1080 x 1920) with native share or download. The text is resized, **not truncated**.
- Save one favorite fortune locally and reopen it without signing in.
- Officially released tracks link to a **YouTube Music search**. This does not pretend to link to any specific official upload.
- Header logo, Back button and browser history navigation use an in-page route.
- Dynamic chapter number, keyboard-accessible dialogs, reduced-motion handling.
- Static Open Graph and Twitter text metadata; replace relative `og:image` with an absolute public image URL after hosting. Per-fortune social previews require server rendering or a static per-song page.

## Archive policy

The database retains **501 records**, of which **491 complete fortunes** are selectable. They comprise 346 song-context drafts and 145 title-inspired drafts. Nine alternate versions and one reference-only entry without a fortune remain indexed but are not selected. The 501 records are not 501 independently verified recordings. Original review/status metadata is preserved.

Selecting a fortune does not imply its recording, lyrics, or historical account has been independently verified. Preserve `status`, `review_status`, sources and recording-date uncertainty, especially for 145 title-inspired drafts. To keep the full Persian catalog available, select records only when `public_eligible` and `random_eligible` are true and fortune/history are present.

The Persian picker samples uniformly from 491 eligible fortunes, avoiding a user's last 20 draws when local storage is available. When local storage is blocked, it uses session memory. The English picker currently uses the 36 fully translated fortunes until the other entries receive English translations.

## Rights

Photographs were supplied by the user. Download availability does not grant republication rights. Obtain licenses or replace images before launching publicly. All fortune texts are interpretations, not official Tupac quotations, and publication accuracy remains under editorial review. There is no audio or lyric transcription in this project.

## Localization

The UI is initially Persian. `locales/fa.json` holds UI strings; translated fortunes should be stored by consistent `id` in locale-specific data before enabling more languages. Use HTML `lang` and `dir` and CSS logical properties. Full multilingual content has not been implemented yet.

## QA

Chromium-based layout and behavior tests were run with `page.set_content` against the self-contained preview at 320, 360, 390, 430, 768 and 1440px widths. They passed checks for horizontal overflow, JS exceptions, drawing, saving, story preview generation and dialog close. Direct browser navigation to `file://` or `localhost` is blocked by the current testing environment; the supplied local HTML should also be checked on an actual Android device.

## v1.2: media metadata + image variation

- All **501** archive records remain intact and have a `headline`, `headline_review`, and `music` metadata object. Existing fortunes, histories, and research flags are preserved.
- **346** song-context records include YouTube Music and Spotify **search/discovery links**, of which **36** appear in the public site today. They are **not verified direct recording URLs**. The other 155 records (title-inspired, alternate versions and archival references) intentionally have no track search link. A verified direct recording can later be added manually to `music.direct_url`.
- The initial 36 headlines are custom editorial drafts; remaining headlines are non-factual drafts derived from the first sentence of the fortune, not independently approved.
- Image `assets/images/image-index.json` contains 16 real downloaded images. The app rotates among **curated portrait images** for home and result, and uses some downloaded paper/grunge textures without mistaking historical scans for a song-specific photo. In the fallback path, original bundled WebP images are still used.
- `image-index.json` and main JSON are fetched when hosted by an HTTP server or GitHub Pages. The one-file mobile preview embeds their JSON so it can work from the phone's file storage.
- `public_eligible` and `random_eligible` control the Persian picker; **491** complete distinct drafts are selectable, while 10 alternate/reference records remain archived. English selection stays at 36 translated chapters. Research and image-rights review are independent of selection eligibility.
