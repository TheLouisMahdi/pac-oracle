'use strict';

const $ = id => document.getElementById(id);
const RECENT_KEY = 'pac-oracle-recent-v1';
const SAVED_KEY = 'pac-oracle-saved-v1';
const MAX_RECENT = 20;
const LANGUAGE_KEY = 'pac-oracle-language-v1';
const memoryStorage = new Map();
const DEFAULT_TEXT = {
  copySuccess: 'متن فال کپی شد.', copyFailed: 'کپی انجام نشد.',
  loadFailure: 'بارگذاری آرشیو انجام نشد. صفحه را دوباره باز کن.',
  noFortune: 'فعلاً فالی برای نمایش وجود ندارد.',
  imageError: 'ساخت تصویر انجام نشد.',
  saved: 'فال ذخیره شد.', unsaved: 'فال از ذخیره‌ها حذف شد.',
};
let messages = DEFAULT_TEXT;
let eligibleFortunes = [];
let currentFortune = null;
let toastTimer;
let revealInProgress = false;
let modalOpener = null;
let previewUrl = null;
let previewBlob = null;
let photoPools = {};
let photoPositions = {};
const photoHistory = {};
let currentLanguage = 'fa';
let currentLocale = null;
let languageRequest = 0;
const localeCache = new Map();

function localizedFortune(item) {
  const translation = currentLanguage === 'en' ? currentLocale?.fortunes?.[item.id] : null;
  return translation ? { ...item, ...translation } : item;
}
function availableFortunes() {
  if (currentLanguage !== 'en') return eligibleFortunes;
  const translations = currentLocale?.fortunes || {};
  return eligibleFortunes.filter(item => {
    const translated = translations[item.id];
    return translated && ['headline', 'fortune', 'history', 'details'].every(
      key => typeof translated[key] === 'string' && translated[key].trim()
    );
  });
}
function applyLocale(locale) {
  currentLocale = locale;
  currentLanguage = locale.lang;
  messages = { ...DEFAULT_TEXT, ...locale.strings };
  document.documentElement.lang = locale.lang;
  document.documentElement.dir = locale.dir;
  document.title = messages.pageTitle;
  for (const [attribute, target] of [['data-i18n', null], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-alt', 'alt']]) {
    document.querySelectorAll(`[${attribute}]`).forEach(element => {
      const text = messages[element.getAttribute(attribute)];
      if (typeof text !== 'string') return;
      if (target) element.setAttribute(target, text);
      else element.textContent = text;
    });
  }
  for (const [selector, key] of [
    ['meta[name="description"]', 'pageDescription'], ['meta[property="og:title"]', 'pageTitle'],
    ['meta[property="og:description"]', 'socialDescription'], ['meta[property="og:locale"]', 'socialLocale'],
    ['meta[property="og:image:alt"]', 'socialImageAlt']
  ]) document.querySelector(selector)?.setAttribute('content', messages[key]);
  $('languageCode').textContent = locale.lang.toUpperCase();
  document.querySelectorAll('[data-language]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.language === locale.lang));
  });
  $('toast').classList.remove('show');
  if (currentFortune && availableFortunes().some(item => item.id === currentFortune.id)) {
    fillResult(currentFortune);
  } else if (currentFortune) {
    currentFortune = null;
    setUrl(null, true);
    switchView(false);
    updateSavedButtons();
  } else updateSavedButtons();
}
async function setLanguage(language, updateUrl = true) {
  if (!['fa', 'en'].includes(language)) language = 'fa';
  const request = ++languageRequest;
  try {
    if (!localeCache.has(language)) {
      const response = await fetch(`locales/${language}.json`);
      if (!response.ok) throw new Error('Language not available');
      const locale = await response.json();
      if (locale.lang !== language || !locale.strings) throw new Error('Invalid language');
      if (language === 'en' && !Object.values(locale.fortunes || {}).some(translation =>
        ['headline', 'fortune', 'history', 'details'].every(key =>
          typeof translation?.[key] === 'string' && translation[key].trim()
        )
      )) throw new Error('No translated fortunes');
      localeCache.set(language, locale);
    }
    if (request !== languageRequest) return;
    applyLocale(localeCache.get(language));
    putLocal(LANGUAGE_KEY, language);
    if (updateUrl) {
      const url = new URL(location.href);
      if (language === 'en') url.searchParams.set('lang', 'en');
      else url.searchParams.delete('lang');
      try { history.replaceState({ fortuneId: currentIdInUrl() }, '', url.pathname + url.search + url.hash); } catch { /* Local preview. */ }
    }
  } catch (error) {
    console.error('PAC / ORACLE language:', error);
    if (request === languageRequest) showToast(messages.languageLoadFailure);
  } finally {
    if (request === languageRequest) {
      $('languagePanel').hidden = true;
      $('languageButton').setAttribute('aria-expanded', 'false');
    }
  }
}
const IMAGE_FALLBACKS = {
  hero: ['assets/hero-portrait.webp', 'assets/images/archive/a02.jpg', 'assets/images/archive/a06.jpg'],
  result: ['assets/result-portrait.webp', 'assets/images/archive/a02.jpg', 'assets/images/archive/a03.jpg', 'assets/images/archive/a04.jpg', 'assets/images/archive/a06.jpg'],
  about: ['assets/archive-portrait.webp', 'assets/images/archive/a01.jpg', 'assets/images/archive/a03.jpg', 'assets/images/archive/a04.jpg'],
  texture: ['assets/paper-texture.webp', 'assets/images/textures/w01.jpg', 'assets/images/textures/w02.jpg', 'assets/images/textures/w03.jpg', 'assets/images/textures/w06.jpg', 'assets/images/textures/w07.jpg']
};

function choosePhoto(category) {
  const photos = [...new Set(photoPools[category] || IMAGE_FALLBACKS[category] || [])];
  if (!photos.length) return null;
  const last = photoHistory[category];
  const candidates = photos.length > 1 ? photos.filter(src => src !== last) : photos;
  const available = candidates.length ? candidates : photos;
  const selected = available[secureRandomIndex(available.length)];
  photoHistory[category] = selected;
  return selected;
}
function updatePhoto(id, category) {
  const image = $(id);
  const url = choosePhoto(category);
  if (!image || !url) return;
  const previous = image.getAttribute('src');
  image.onerror = () => {
    image.onerror = null;
    image.style.objectPosition = '';
    image.src = category === 'hero' ? 'assets/hero-portrait.webp' : 'assets/result-portrait.webp';
  };
  image.style.objectPosition = photoPositions[url]?.[category] || '';
  if (url !== previous) image.src = url;
}
function refreshArtwork(isResult) {
  if (isResult) updatePhoto('resultPortrait', 'result');
  else updatePhoto('heroPortrait', 'hero');
  const texture = choosePhoto('texture');
  if (texture) document.documentElement.style.setProperty('--random-texture', `url("${texture}")`);
}
async function loadPhotoIndex() {
  const embedded = $('embedded-image-index');
  try {
    const response = embedded ? null : await fetch('assets/images/image-index.json');
    if (!embedded && !response.ok) return;
    const entries = embedded ? JSON.parse(embedded.textContent) : await response.json();
    if (!Array.isArray(entries)) return;
    const photos = entries.filter(entry => entry && typeof entry.src === 'string' && /^assets\/images\/(archive|textures)\/[a-z0-9_-]+\.(?:jpg|png|webp)$/.test(entry.src));
    const files = new Set(photos.map(entry => entry.src));
    photoPositions = Object.fromEntries(photos.map(entry => [entry.src, entry.position || {}]));
    photoPools = Object.fromEntries(Object.entries(IMAGE_FALLBACKS).map(([role, fallbacks]) => {
      const existing = fallbacks.filter(src => !src.startsWith('assets/images/') || files.has(src));
      const additions = photos.filter(entry => Array.isArray(entry.roles) && entry.roles.includes(role)).map(entry => entry.src);
      return [role, [...new Set([...existing, ...additions])]];
    }));
  } catch { /* Existing bundled images remain the fallback. */ }
  refreshArtwork(false);
}


function showToast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3400);
}

function getLocal(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored == null ? (memoryStorage.get(key) ?? fallback) : JSON.parse(stored);
  } catch { return memoryStorage.get(key) ?? fallback; }
}
function putLocal(key, value) {
  memoryStorage.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory fallback for restricted browsers. */ }
}

function secureRandomIndex(max) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new RangeError('Invalid range');
  const range = 0x100000000;
  const limit = range - (range % max);
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= limit);
  return random[0] % max;
}
function recentIds() {
  const saved = getLocal(RECENT_KEY, []);
  return Array.isArray(saved) ? saved.filter(Number.isSafeInteger).slice(-MAX_RECENT) : [];
}
function pickFortune() {
  const recent = recentIds();
  const pool = availableFortunes();
  let candidates = pool.filter(item => !recent.includes(item.id));
  if (!candidates.length) candidates = pool;
  if (!candidates.length) return null;
  const selected = candidates[secureRandomIndex(candidates.length)];
  putLocal(RECENT_KEY, [...recent.filter(id => id !== selected.id), selected.id].slice(-MAX_RECENT));
  return selected;
}

function safeSourceLink(raw) {
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function setSources(sources) {
  const list = $('sourcesList');
  list.replaceChildren();
  const links = [...new Set((Array.isArray(sources) ? sources : []).map(safeSourceLink).filter(Boolean))];
  $('sourcesDetails').hidden = !links.length;
  links.forEach((href, index) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `${index + 1}. ${new URL(href).hostname}`;
    li.append(a);
    list.append(li);
  });
  $('sourcesDetails').open = false;
}

function savedId() {
  const id = getLocal(SAVED_KEY, null);
  return Number.isSafeInteger(id) ? id : null;
}
function updateSavedButtons() {
  const id = savedId();
  const savedExists = availableFortunes().some(item => item.id === id);
  $('savedFortuneButton').hidden = !savedExists;
  const isSaved = Boolean(currentFortune && currentFortune.id === id && savedExists);
  $('saveButton').setAttribute('aria-pressed', String(isSaved));
  $('saveButtonText').textContent = isSaved ? messages.savedButton : messages.saveButton;
}
function toggleSave() {
  if (!currentFortune) return;
  const isSaved = savedId() === currentFortune.id;
  putLocal(SAVED_KEY, isSaved ? null : currentFortune.id);
  updateSavedButtons();
  showToast(isSaved ? messages.unsaved : messages.saved);
}
function openSaved() {
  const item = availableFortunes().find(f => f.id === savedId());
  if (item) revealFortune(item, false);
}

function fillResult(item) {
  currentFortune = item;
  item = localizedFortune(item);
  const number = String(item.id).padStart(3, '0');
  $('fortuneNumber').textContent = `NO. ${number}`;
  $('sheetChapterCode').textContent = `${number} / WORDS THAT FIND YOU`;
  $('songTitle').textContent = item.song;
  $('songDetails').textContent = item.details || '';
  $('fortuneHeadline').textContent = item.headline || '';
  $('fortuneText').textContent = item.fortune;
  $('historyText').textContent = item.history || '';
  setSources(item.sources);
  const youtube = item.music?.youtube_music_search;
  const spotify = item.music?.spotify_search;
  const links = [
    ['listenLink', youtube, 'music.youtube.com'],
    ['spotifyLink', spotify, 'open.spotify.com']
  ];
  for (const [id, url, host] of links) {
    const element = $(id);
    const allowed = typeof url === 'string' && safeSourceLink(url) && new URL(url).hostname === host;
    element.hidden = !allowed;
    if (allowed) element.href = url;
    else element.removeAttribute('href');
  }
  $('musicLinks').hidden = !links.some(([id]) => !$(id).hidden);
  updateSavedButtons();
}

function currentIdInUrl() {
  const raw = new URLSearchParams(location.search).get('f');
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
function setUrl(id, replace = false) {
  const url = new URL(location.href);
  if (id == null) url.searchParams.delete('f');
  else url.searchParams.set('f', String(id));
  const state = { fortuneId: id };
  try { history[replace ? 'replaceState' : 'pushState'](state, '', url.pathname + url.search + url.hash); }
  catch { /* Some mobile file:// viewers forbid modifying local URLs. */ }
}
function switchView(isResult) {
  $('homeView').hidden = isResult;
  $('homeBottom').hidden = isResult;
  $('resultView').hidden = !isResult;
  refreshArtwork(isResult);
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (isResult) {
    $('songTitle').tabIndex = -1;
    $('songTitle').focus({ preventScroll: true });
  }
}
function routeFromUrl() {
  const match = availableFortunes().find(item => item.id === currentIdInUrl());
  if (match) { fillResult(match); switchView(true); }
  else { currentFortune = null; switchView(false); updateSavedButtons(); }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function revealFortune(item, animate = true) {
  if (!item || revealInProgress) return;
  revealInProgress = true;
  $('drawButton').disabled = true;
  $('againButton').disabled = true;
  try {
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('revealOverlay').hidden = false;
      await delay(420);
    }
    fillResult(item);
    if (currentIdInUrl() !== item.id) setUrl(item.id);
    switchView(true);
  } finally {
    $('revealOverlay').hidden = true;
    $('drawButton').disabled = false;
    $('againButton').disabled = false;
    revealInProgress = false;
  }
}
function drawFortune() {
  if (revealInProgress) return;
  const item = pickFortune();
  if (item) revealFortune(item);
  else showToast(messages.noFortune);
}
function goHome(event) {
  event?.preventDefault();
  if (currentIdInUrl() != null) setUrl(null);
  currentFortune = null;
  switchView(false);
  $('drawButton').focus({ preventScroll: true });
}

function shareableText() {
  if (!currentFortune) return '';
  const item = localizedFortune(currentFortune);
  return `PAC / ORACLE | ${item.song}\n${item.headline || ''}\n\n${item.fortune}\n\n${location.href}`;
}
async function copyFortune() {
  if (!currentFortune) return;
  try {
    const value = shareableText();
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const field = document.createElement('textarea');
      field.value = value;
      field.style.cssText = 'position:fixed;opacity:0';
      document.body.append(field);
      field.select();
      const result = document.execCommand('copy');
      field.remove();
      if (!result) throw new Error('Copy disabled');
    }
    showToast(messages.copySuccess);
  } catch { showToast(messages.copyFailed); }
}

// Wrap every paragraph; text size is computed from the *entire* fortune, not a truncated excerpt.
function wrapText(ctx, text, width) {
  const lines = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(next).width <= width) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}
async function createStoryImage(item) {
  item = localizedFortune(item);
  const storyMessages = messages;
  const isEnglish = currentLanguage === 'en';
  await Promise.race([document.fonts.ready, delay(2000)]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#c52c35';
  ctx.fillRect(0, 0, 16, 1920);
  ctx.fillStyle = '#f1ebe2';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.font = '64px "Archivo Black", Arial, sans-serif';
  ctx.fillText('PAC / ORACLE', 90, 138);
  ctx.fillStyle = '#a9a39d';
  ctx.font = '23px "Archivo Black", Arial, sans-serif';
  ctx.fillText(`AN ARCHIVE OF VOICES     /     NO. ${String(item.id).padStart(3, '0')}`, 90, 221);
  ctx.fillStyle = '#c52c35';
  ctx.fillRect(90, 263, 95, 7);

  ctx.fillStyle = '#e8ded0';
  ctx.fillRect(73, 329, 935, 1282);
  ctx.fillStyle = '#1b1a1b';
  ctx.fillRect(121, 398, 839, 3);
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  const titleFont = '"Archivo Black", Arial, sans-serif';
  let titleSize = 54;
  let titleLines;
  do {
    ctx.font = `${titleSize}px ${titleFont}`;
    titleLines = wrapText(ctx, item.song.toUpperCase(), 835);
    if (titleLines.length * titleSize * 1.12 <= 198 || titleSize <= 27) break;
    titleSize -= 2;
  } while (true);
  ctx.fillStyle = '#1b1a1b';
  let headingY = 487;
  titleLines.forEach(line => {
    ctx.fillText(line, 121, headingY);
    headingY += titleSize * 1.18;
  });
  ctx.fillStyle = '#b52b35';
  ctx.fillRect(121, 710, 90, 6);
  ctx.direction = isEnglish ? 'ltr' : 'rtl';
  ctx.textAlign = isEnglish ? 'left' : 'right';
  ctx.fillStyle = '#6b554a';
  ctx.font = '600 33px "Vazirmatn", Tahoma, sans-serif';
  ctx.fillText(storyMessages.fortuneLabel, isEnglish ? 121 : 953, 776);
  ctx.fillStyle = '#171617';
  ctx.font = '700 36px "Vazirmatn", Tahoma, sans-serif';
  const headlineLines = wrapText(ctx, item.headline || '', 828).slice(0, 2);
  let headlineY = 835;
  headlineLines.forEach(line => { ctx.fillText(line, isEnglish ? 121 : 953, headlineY); headlineY += 49; });

  const availableHeight = 510;
  const maxWidth = 835;
  let size = 67;
  let lines;
  let lineHeight;
  do {
    ctx.font = `700 ${size}px "Vazirmatn", Tahoma, sans-serif`;
    lines = wrapText(ctx, item.fortune, maxWidth);
    lineHeight = size * 1.76;
    if (lines.length * lineHeight <= availableHeight || size <= 20) break;
    size -= 2;
  } while (true);
  // For unexpectedly long archival text, keep shrinking to preserve every line.
  while (lines.length * lineHeight > availableHeight && size > 10) {
    size -= 1;
    ctx.font = `700 ${size}px "Vazirmatn", Tahoma, sans-serif`;
    lines = wrapText(ctx, item.fortune, maxWidth);
    lineHeight = size * 1.66;
  }
  ctx.fillStyle = '#171617';
  let y = 948;
  lines.forEach(line => {
    ctx.fillText(line, isEnglish ? 121 : 953, y);
    y += lineHeight;
  });
  ctx.fillStyle = '#1b1a1b';
  ctx.fillRect(121, 1528, 839, 3);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.font = '23px "Archivo Black", Arial, sans-serif';
  ctx.fillText('NOT A PROPHECY. JUST A PERSPECTIVE.', 121, 1580);
  ctx.fillStyle = '#262326';
  ctx.font = '220px "Archivo Black", Arial, sans-serif';
  ctx.fillText('2PAC', 80, 1819);
  ctx.fillStyle = '#c52c35';
  ctx.font = '104px Arial';
  ctx.fillText('✳', 872, 1782);
  ctx.fillStyle = '#a9a39d';
  ctx.font = '21px "Archivo Black", Arial, sans-serif';
  ctx.fillText('EVERY SONG HAS A STORY.', 90, 1874);
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG failed')), 'image/png')
  );
}

function showDialog(id, focusId) {
  modalOpener = document.activeElement;
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
  $(focusId).focus();
}
function dismissDialog(id) {
  $(id).hidden = true;
  document.body.style.overflow = '';
  modalOpener?.focus();
}
function disposePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  previewBlob = null;
  $('sharePreviewImage').removeAttribute('src');
}
async function previewStory() {
  if (!currentFortune) return;
  $('shareButton').disabled = true;
  try {
    const blob = await createStoryImage(currentFortune);
    disposePreview();
    previewBlob = blob;
    previewUrl = URL.createObjectURL(blob);
    $('sharePreviewImage').src = previewUrl;
    await $('sharePreviewImage').decode();
    showDialog('shareModal', 'closeShareModal');
  } catch (error) {
    console.error(error);
    showToast(messages.imageError);
  } finally { $('shareButton').disabled = false; }
}
function closePreview() {
  dismissDialog('shareModal');
  disposePreview();
}
function downloadPreview() {
  if (!previewBlob) return;
  const link = document.createElement('a');
  link.href = previewUrl;
  link.download = `pac-oracle-${currentFortune.id}.png`;
  document.body.append(link);
  link.click();
  link.remove();
}
async function sendPreview() {
  if (!previewBlob) return;
  const file = new File([previewBlob], `pac-oracle-${currentFortune.id}.png`, { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'PAC / ORACLE', text: currentFortune.song }); }
    catch (error) { if (error.name !== 'AbortError') showToast(messages.sendImageFailed); }
  } else downloadPreview();
}

function openAbout() { showDialog('aboutModal', 'closeModal'); }
function closeAbout() { dismissDialog('aboutModal'); }
function focusTrap(event, modal) {
  const elements = Array.from(modal.querySelectorAll('a[href],button:not([disabled])'));
  if (!elements.length) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function installEvents() {
  $('brandHome').addEventListener('click', goHome);
  $('drawButton').addEventListener('click', drawFortune);
  $('savedFortuneButton').addEventListener('click', openSaved);
  $('againButton').addEventListener('click', drawFortune);
  $('backButton').addEventListener('click', goHome);
  $('saveButton').addEventListener('click', toggleSave);
  $('copyButton').addEventListener('click', copyFortune);
  $('shareButton').addEventListener('click', previewStory);
  $('closeShareModal').addEventListener('click', closePreview);
  $('downloadImageButton').addEventListener('click', downloadPreview);
  $('sendImageButton').addEventListener('click', sendPreview);
  $('aboutButton').addEventListener('click', openAbout);
  $('footerAboutButton').addEventListener('click', openAbout);
  $('closeModal').addEventListener('click', closeAbout);
  for (const [id, close] of [['aboutModal', closeAbout], ['shareModal', closePreview]]) {
    $(id).addEventListener('click', event => { if (event.target === $(id)) close(); });
  }
  document.addEventListener('keydown', event => {
    const modal = !$('shareModal').hidden ? $('shareModal') : !$('aboutModal').hidden ? $('aboutModal') : null;
    if (!modal) return;
    if (event.key === 'Escape') { modal === $('shareModal') ? closePreview() : closeAbout(); }
    else if (event.key === 'Tab') focusTrap(event, modal);
  });
  $('languageButton').addEventListener('click', () => {
    $('languagePanel').hidden = !$('languagePanel').hidden;
    $('languageButton').setAttribute('aria-expanded', String(!$('languagePanel').hidden));
  });
  document.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('languagePanel').hidden) {
      $('languagePanel').hidden = true;
      $('languageButton').setAttribute('aria-expanded', 'false');
      $('languageButton').focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.language-wrap')) {
      $('languagePanel').hidden = true;
      $('languageButton').setAttribute('aria-expanded', 'false');
    }
  });
  window.addEventListener('popstate', async () => {
    const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'fa';
    if (language !== currentLanguage) await setLanguage(language, false);
    routeFromUrl();
  });
}

async function initialize() {
  installEvents();
  try {
    const embeddedDb = $('embedded-data');
    const embeddedLocale = $('embedded-locale');
    const [databaseResponse, localeResponse] = embeddedDb
      ? [null, null]
      : await Promise.all([fetch('data/2pac_oracle_database.json'), fetch('locales/fa.json')]);
    if (!embeddedDb && !databaseResponse.ok) throw new Error('Database not found');
    const database = embeddedDb ? JSON.parse(embeddedDb.textContent) : await databaseResponse.json();
    if (!Array.isArray(database.fortunes)) throw new Error('Invalid data');
    if (embeddedLocale || localeResponse?.ok) {
      const locale = embeddedLocale ? JSON.parse(embeddedLocale.textContent) : await localeResponse.json();
      localeCache.set('fa', locale);
      applyLocale(locale);
    }
    eligibleFortunes = database.fortunes.filter(item =>
      item.public_eligible === true && item.random_eligible === true &&
      Number.isSafeInteger(item.id) && typeof item.song === 'string' &&
      typeof item.fortune === 'string' && item.fortune.trim() &&
      typeof item.history === 'string' && item.history.trim()
    );
    if (!eligibleFortunes.length) throw new Error('No eligible fortunes');
    const urlLanguage = new URLSearchParams(location.search).get('lang');
    const language = urlLanguage === 'en' || urlLanguage === 'fa' ? urlLanguage : getLocal(LANGUAGE_KEY, 'fa');
    await setLanguage(language);
    await loadPhotoIndex();
    routeFromUrl();
    try { history.replaceState({ fortuneId: currentIdInUrl() }, '', location.href); } catch { /* Local preview. */ }
  } catch (error) {
    console.error('PAC / ORACLE:', error);
    $('drawButton').disabled = true;
    $('drawButton').textContent = messages.loadFailure;
    showToast(messages.loadFailure);
  }
}
initialize();
