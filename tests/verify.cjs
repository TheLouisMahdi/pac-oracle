const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(read(name));
const database = json('data/2pac_oracle_database.json').fortunes;
const english = json('locales/en.json');
const baseline = '306562ff0ec12e7c4f1c79e2b38e73f0c1b07955';
const eligible = database.filter(item => item.public_eligible === true && item.random_eligible === true &&
  Number.isSafeInteger(item.id) && typeof item.song === 'string' &&
  typeof item.fortune === 'string' && item.fortune.trim() && typeof item.history === 'string' && item.history.trim());
const app = read('app.js').replace(/\r/g, '').replace(/\ninitialize\(\);\s*$/, '\n');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// This small DOM/clock fixture executes the real app without browser or test dependencies.
async function fixture({ language = 'fa', fortune, reduced = false, blockedStorage = false } = {}) {
  const clock = { now: 0, next: 0, jobs: new Map() };
  clock.set = (callback, ms) => { const id = ++clock.next; clock.jobs.set(id, { callback, at: clock.now + ms }); return id; };
  clock.clear = id => clock.jobs.delete(id);
  clock.tick = async ms => {
    const target = clock.now + ms;
    for (;;) {
      await flush();
      const next = [...clock.jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock.now = next[1].at;
      clock.jobs.delete(next[0]);
      next[1].callback();
    }
    clock.now = target;
    await flush();
  };
  const titles = [], errors = [], writes = [], copied = [], canvasText = [];
  let document;
  class Element {
    constructor(tag, attrs = {}) {
      this.tag = tag; this.attrs = attrs; this.id = attrs.id; this.hidden = 'hidden' in attrs;
      this.disabled = false; this.children = []; this.dataset = {}; this.events = {};
      this.style = { setProperty(key, value) { this[key] = value; } };
      const classes = new Set((attrs.class || '').split(/\s+/));
      this.classList = { add: (...keys) => keys.forEach(key => classes.add(key)),
        remove: (...keys) => keys.forEach(key => classes.delete(key)), contains: key => classes.has(key) };
      for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) {
        this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      }
    }
    set textContent(value) { this.text = value; if (this.id === 'revealSongTitle') titles.push({ at: clock.now, title: value }); }
    get textContent() { return this.text || ''; }
    set src(value) { this.attrs.src = value; }
    get src() { return this.attrs.src; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
    replaceChildren() { this.children = []; }
    append(child) { this.children.push(child); }
    focus() { document.activeElement = this; }
    querySelectorAll() { return []; }
    decode() { return Promise.resolve(); }
    select() {}
    remove() {}
    click() { for (const callback of this.events.click || []) callback({ target: this }); }
  }
  const elements = [...read('index.html').matchAll(/<([a-z][\w-]*)\b([^>]*?)>/gi)].map(([, tag, text]) => {
    const attrs = {};
    for (const [, key, double, single] of text.matchAll(/([\w:-]+)(?:="([^"]*)"|='([^']*)')?/g)) attrs[key] = double ?? single ?? '';
    return new Element(tag, attrs);
  });
  const ids = new Map(elements.filter(el => el.id).map(el => [el.id, el]));
  const canvasContext = { fillRect() {}, measureText(text) { return { width: text.length * parseFloat(this.font || '20') * .52 }; },
    fillText(text) { canvasText.push(text); } };
  document = {
    documentElement: elements.find(el => el.tag === 'html'), body: elements.find(el => el.tag === 'body'),
    fonts: { ready: Promise.resolve() }, getElementById: id => ids.get(id) || null, addEventListener() {},
    querySelectorAll: selector => elements.filter(el => selector.startsWith('[') && selector.slice(1, -1) in el.attrs),
    querySelector: selector => {
      const match = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
      return match ? elements.find(el => el.tag === 'meta' && el.attrs[match[1]] === match[2]) : null;
    },
    createElement: tag => tag === 'canvas' ? { width: 0, height: 0, getContext: () => canvasContext,
      toBlob: callback => callback(new Blob(['test canvas'], { type: 'image/png' })) } : new Element(tag)
  };
  const events = {}, storage = new Map();
  const suffix = `?lang=${language}${fortune ? '&f=' + fortune : ''}`;
  const context = vm.createContext({ document, URL, URLSearchParams, Blob, AbortController,
    crypto: webcrypto, setTimeout: clock.set, clearTimeout: clock.clear,
    matchMedia: () => ({ matches: reduced }), location: new URL('https://example.test/pac-oracle/' + suffix),
    console: { error: (...args) => errors.push(args) },
    fetch: async name => ({ ok: true, json: async () => json(name) }),
    navigator: { clipboard: { writeText: async value => copied.push(value) } },
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw Error('Storage blocked'); storage.set(key, value); writes.push(key); }
    },
    window: { scrollTo() {}, addEventListener(type, callback) { (events[type] ||= []).push(callback); } }
  });
  const history = { urls: [context.location.href], index: 0 };
  history.pushState = (_state, _title, url) => {
    context.location = new URL(url, context.location); history.urls.splice(++history.index); history.urls.push(context.location.href);
  };
  history.replaceState = (_state, _title, url) => {
    context.location = new URL(url, context.location); history.urls[history.index] = context.location.href;
  };
  history.move = async step => {
    history.index += step; context.location = new URL(history.urls[history.index]);
    for (const callback of events.popstate || []) await callback();
  };
  context.history = history;
  const run = code => vm.runInContext(code, context);
  const value = code => JSON.parse(run(`JSON.stringify(${code})`));
  run(app);
  await run('initialize()');
  run('let pickCalls = 0; const originalPick = pickFortune; pickFortune = () => { pickCalls++; return originalPick(); };');
  return { run, value, clock, ids, document, titles, errors, writes, copied, canvasText, context, history, events };
}

test('archive and all 501 English entries preserve classification, content, and prior translations', () => {
  assert.equal(database.length, 501);
  assert.equal(new Set(database.map(item => item.id)).size, 501);
  assert.equal(eligible.length, 491);
  const alternates = database.filter(item => item.status === 'alternate_version');
  assert.deepEqual(alternates.map(item => item.id), [430, 434, 438, 446, 452, 454, 470, 472, 476]);
  assert.ok(alternates.every(item => !item.random_eligible && !item.public_eligible));
  assert.equal(database[500].status, 'reference_only');
  assert.equal(database[500].fortune, null);
  assert.equal(english.fortunes['501'].fortune, null);
  assert.equal(Object.keys(english.fortunes).length, 501);
  for (const item of database) for (const key of ['headline', 'fortune', 'history', 'details']) {
    const translation = english.fortunes[item.id]?.[key];
    if (item.id === 501 && key === 'fortune') continue;
    assert.ok(typeof translation === 'string' && translation.trim(), `${item.id}: ${key}`);
    assert.doesNotMatch(translation, /[\u0600-\u06ff]/, `${item.id}: ${key}`);
  }
  const original = name => execFileSync('git', ['show', `${baseline}:${name}`], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(json('data/2pac_oracle_database.json'), JSON.parse(original('data/2pac_oracle_database.json')));
  const previous = JSON.parse(original('locales/en.json'));
  for (const [id, translation] of Object.entries(previous.fortunes)) assert.deepEqual(english.fortunes[id], translation, id);
  assert.match(english.fortunes['481'].history, /November 28, 1995.*1996/);
  assert.match(english.fortunes['501'].history, /reference to chapter 361/);
});

test('all UI localization keys exist in both languages', () => {
  const fa = json('locales/fa.json');
  assert.deepEqual(Object.keys(fa.strings).sort(), Object.keys(english.strings).sort());
  for (const [, key] of read('index.html').matchAll(/data-i18n(?:-aria-label|-alt)?="([^"]+)"/g)) {
    assert.ok(fa.strings[key] && english.strings[key], key);
    assert.doesNotMatch(english.strings[key], /[\u0600-\u06ff]/);
  }
});

for (const language of ['fa', 'en']) {
  test(`${language}: every eligible ID renders in the correct language without Persian fallback`, async () => {
    const f = await fixture({ language });
    assert.equal(f.value('availableFortunes().length'), 491);
    for (const item of eligible) {
      f.run(`fillResult(eligibleFortunes.find(item => item.id === ${item.id}))`);
      const translated = language === 'en' ? english.fortunes[item.id] : item;
      for (const [id, key] of [['fortuneHeadline', 'headline'], ['fortuneText', 'fortune'], ['historyText', 'history'], ['songDetails', 'details']]) {
        assert.equal(f.ids.get(id).textContent, translated[key], `${item.id}: ${key}`);
      }
    }
    assert.equal(f.value('pickCalls'), 0);
    assert.equal(f.errors.length, 0);
  });

  test(`${language}: first and another draw take 1050ms, with five real titles and one selection each`, async () => {
    const f = await fixture({ language });
    for (let draw = 1; draw <= 2; draw++) {
      const start = f.clock.now, traceStart = f.titles.length;
      f.run('drawFortune()');
      const selected = f.value('recentIds().at(-1)');
      assert.equal(f.value('pickCalls'), draw);
      assert.equal(f.ids.get('drawButton').disabled, true);
      assert.equal(f.ids.get('revealOverlay').hidden, false);
      await f.clock.tick(750);
      assert.equal(f.value('currentFortune.id'), selected);
      assert.equal(f.ids.get('revealSongTitle').textContent, database[selected - 1].song);
      assert.equal(f.ids.get('revealOverlay').dataset.phase, 'print');
      await f.clock.tick(299);
      assert.equal(f.ids.get('againButton').disabled, true);
      await f.clock.tick(1);
      assert.equal(f.clock.now - start, 1050);
      assert.equal(f.ids.get('revealOverlay').hidden, true);
      assert.equal(f.ids.get('againButton').disabled, false);
      assert.equal(f.document.activeElement.id, 'songTitle');
      const sequence = f.titles.slice(traceStart);
      assert.equal(sequence.length, 5);
      assert.ok(sequence.every(item => eligible.some(original => original.song === item.title)));
      assert.equal(f.clock.jobs.size, 0);
    }
    assert.equal(f.writes.filter(key => key.includes('recent')).length, 2);
  });
}

test('rapid repeated actions select and store only one fortune while busy', async () => {
  const f = await fixture();
  f.run('for (let i=0;i<50;i++) drawFortune()');
  assert.equal(f.value('pickCalls'), 1);
  assert.equal(f.writes.filter(key => key.includes('recent')).length, 1);
  await f.clock.tick(1050);
  assert.equal(f.value('recentIds().length'), 1);
});

test('reduced motion reveals immediately, without an overlay or reveal timers', async () => {
  for (const language of ['fa', 'en']) {
    const f = await fixture({ language, reduced: true });
    f.run('drawFortune()');
    assert.ok(f.value('currentFortune.id'));
    assert.equal(f.value('revealInProgress'), false);
    assert.equal(f.ids.get('resultView').hidden, false);
    assert.equal(f.ids.get('revealOverlay').hidden, true);
    assert.equal(f.titles.length, 0);
    assert.equal(f.clock.jobs.size, 0);
    assert.equal(f.document.activeElement.id, 'songTitle');
  }
});

test('direct shared ID 500, language changes, saved reopen, Back and Forward never animate or draw', async () => {
  const f = await fixture({ language: 'en', fortune: 500 });
  assert.equal(f.value('currentFortune.id'), 500);
  assert.equal(f.ids.get('revealOverlay').hidden, true);
  f.run('toggleSave();goHome();openSaved()');
  await flush();
  assert.equal(f.value('currentFortune.id'), 500);
  await f.run("setLanguage('fa')");
  assert.equal(f.value('currentFortune.id'), 500);
  assert.equal(f.ids.get('fortuneText').textContent, database[499].fortune);
  await f.run("setLanguage('en')");
  f.run('goHome()');
  await f.history.move(-1);
  assert.equal(f.value('currentFortune.id'), 500);
  await f.history.move(1);
  assert.equal(f.value('currentFortune'), null);
  assert.equal(f.value('pickCalls'), 0);
  assert.equal(f.titles.length, 0);
});

test('navigation or a language change cancels pending timers and cannot overwrite newer state', async () => {
  for (const interrupt of ['goHome()', "setLanguage('en')", "routeFromUrl()", "showDialog('aboutModal','closeModal')"]) {
    const f = await fixture();
    f.run('drawFortune()');
    await f.clock.tick(320);
    await f.run(interrupt);
    await f.clock.tick(2000);
    assert.equal(f.value('currentFortune'), null, interrupt);
    assert.equal(f.value('revealInProgress'), false, interrupt);
    assert.equal(f.ids.get('revealOverlay').hidden, true, interrupt);
    assert.equal(f.ids.get('drawButton').disabled, false, interrupt);
    assert.equal(f.clock.jobs.size, 0, interrupt);
  }
  const f = await fixture();
  f.run('drawFortune();goHome();drawFortune()');
  await flush();
  assert.equal(f.ids.get('drawButton').disabled, true);
  await f.clock.tick(1050);
  assert.equal(f.value('currentFortune.id'), f.value('recentIds().at(-1)'));
});

test('Back during printing and pagehide clean up the overlay and preserve routed data', async () => {
  const f = await fixture({ fortune: 500 });
  f.run('drawFortune()');
  await f.clock.tick(750);
  await f.history.move(-1);
  await f.clock.tick(1000);
  assert.equal(f.value('currentFortune.id'), 500);
  assert.equal(f.ids.get('revealOverlay').hidden, true);
  f.run('drawFortune()');
  await f.clock.tick(180);
  for (const callback of f.events.pagehide) callback();
  await f.clock.tick(2000);
  assert.equal(f.clock.jobs.size, 0);
  assert.equal(f.value('revealInProgress'), false);
});

test('a delayed language response also cancels a reveal started while it was loading', async () => {
  const f = await fixture();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.context.fetch = async () => { await gate; return { ok: true, json: async () => english }; };
  const switching = f.run("setLanguage('en')");
  f.run('drawFortune()');
  assert.equal(f.value('revealInProgress'), true);
  release();
  await switching;
  await f.clock.tick(2000);
  assert.equal(f.value('currentLanguage'), 'en');
  assert.equal(f.value('currentFortune'), null);
  assert.equal(f.ids.get('revealOverlay').hidden, true);
  assert.equal(f.clock.jobs.size, 0);
});

test('render errors release buttons and restore the URL-based view', async () => {
  const f = await fixture();
  f.run("fillResult = () => { throw new Error('Simulated render failure'); }; drawFortune()");
  await f.clock.tick(1050);
  assert.equal(f.ids.get('revealOverlay').hidden, true);
  assert.equal(f.ids.get('drawButton').disabled, false);
  assert.equal(f.ids.get('againButton').disabled, false);
  assert.equal(f.value('currentFortune'), null);
  assert.equal(f.errors.length, 1);
});

test('missing English content is rejected instead of silently displaying Persian', async () => {
  const f = await fixture({ language: 'en' });
  f.run('delete currentLocale.fortunes[500]');
  assert.equal(f.value('availableFortunes().some(item=>item.id===500)'), false);
  assert.throws(() => f.run('localizedFortune(eligibleFortunes.find(item=>item.id===500))'), /Missing English translation/);
});

test('last-20 avoidance and the in-memory fallback remain intact', async () => {
  for (const blockedStorage of [false, true]) {
    const f = await fixture({ language: 'en', reduced: true, blockedStorage });
    const draws = [];
    for (let i = 0; i < 45; i++) {
      f.run('drawFortune()');
      const id = f.value('currentFortune.id');
      assert.ok(!draws.slice(-20).includes(id));
      draws.push(id);
    }
    assert.equal(f.value('recentIds().length'), 20);
  }
});

test('copy and story-image drawing use the translated fortune and preserve discovery links', async () => {
  const f = await fixture({ language: 'en', fortune: 500 });
  await f.run('copyFortune()');
  assert.ok(f.copied[0].includes(english.fortunes['500'].fortune));
  assert.ok(f.copied[0].includes('lang=en&f=500'));
  assert.doesNotMatch(f.copied[0], /[\u0600-\u06ff]/);
  await f.run('previewStory()');
  assert.equal(f.ids.get('shareModal').hidden, false);
  assert.ok(f.canvasText.join(' ').includes('Your fortune'));
  assert.ok(f.canvasText.includes('WELCOME 2 DEATH ROW'));
  f.run('closePreview();fillResult(eligibleFortunes.find(item=>item.id===75))');
  assert.match(f.ids.get('listenLink').href, /^https:\/\/music\.youtube\.com\/search/);
  assert.match(f.ids.get('spotifyLink').href, /^https:\/\/open\.spotify\.com\/search/);
  assert.equal(f.errors.length, 0);
});
