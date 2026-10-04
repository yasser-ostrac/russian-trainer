/* Review fixes + progress backup. Wraps Backend.handle, so backend.js is not edited. */
(() => {
  const KEYS = ['ru-trainer-state-v1', 'ru-extras-v1', 'ru-read-v1', 'ru-activity-v1', 'prefs'];
  const orig = Backend.handle;
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  // Same ids as the backend's own card list (day order, first occurrence of day|word)
  async function cards() {
    const days = await orig('/api/days'), seen = new Set(), out = [];
    days.forEach(d => d.vocab.forEach(v => {
      const key = d.day + '|' + v.ru;
      if (seen.has(key)) return;
      seen.add(key); out.push({ id: out.length + 1, key, day: d.day, ru: v.ru, tr: v.tr, en: v.en });
    }));
    return out;
  }

  Backend.handle = async (url, body) => {
    if (url === '/api/review') {
      // One card per word (not one per day it appeared on), weak words first, then lowest box, then oldest due.
      const S = (await Backend.ready)._state(), all = await cards(), t = today();
      const cs = c => S.cards[c.key] || { box: 0, due: '0000-00-00' };
      const weak = c => (S.items[c.ru] && S.items[c.ru].wrong > 0 && cs(c).box < 2) ? 1 : 0;
      const first = new Map();
      all.filter(c => S.progress[c.day] === 1 && cs(c).due <= t).forEach(c => { if (!first.has(c.ru)) first.set(c.ru, c); });
      return [...first.values()]
        .sort((a, b) => weak(b) - weak(a) || cs(a).box - cs(b).box || (cs(a).due < cs(b).due ? -1 : cs(a).due > cs(b).due ? 1 : 0) || a.id - b.id)
        .slice(0, 20).map(c => ({ id: c.id, ru: c.ru, tr: c.tr, en: c.en, box: cs(c).box, day: c.day }));
    }
    const r = await orig(url, body);
    const m = url.match(/^\/api\/review\/(\d+)$/);
    if (m && r && r.box !== undefined) {
      // One word, one schedule: copy the result to every duplicate of that word.
      const S = (await Backend.ready)._state(), all = await cards(), c = all[+m[1] - 1];
      if (c) {
        all.filter(x => x.ru === c.ru).forEach(x => { S.cards[x.key] = { box: r.box, due: r.due }; });
        try { localStorage.setItem(KEYS[0], JSON.stringify(S)); } catch (e) {}
      }
    }
    return r;
  };

  /* ---------- backup / restore ---------- */
  const backup = {
    export() {
      const data = {};
      KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data[k] = v; });
      return JSON.stringify({ app: 'russian-trainer', version: 1, saved: new Date().toISOString(), data });
    },
    import(text) {
      let j;
      try { j = JSON.parse(text); } catch (e) { throw new Error('That is not a JSON file.'); }
      if (!j || j.app !== 'russian-trainer' || !j.data) throw new Error('That file is not a Russian Trainer backup.');
      const keys = Object.keys(j.data).filter(k => KEYS.includes(k) && typeof j.data[k] === 'string');
      try { keys.forEach(k => JSON.parse(j.data[k])); } catch (e) { throw new Error('That backup file is damaged.'); }  // validate everything first
      keys.forEach(k => localStorage.setItem(k, j.data[k]));
      return keys.length;
    },
  };
  window.RuBackup = backup;

  const box = document.createElement('div');
  box.style.cssText = 'width:100%;margin-top:.6rem;font-size:.85rem';
  box.innerHTML = '<b>Backup</b><br><button class="mini" id="bk-out">Export progress</button> <button class="mini" id="bk-in">Import…</button>' +
    '<input type="file" id="bk-file" accept=".json,application/json" hidden><span id="bk-msg" style="margin-left:.5rem"></span>';
  $('#set').appendChild(box);
  $('#bk-out').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([backup.export()], { type: 'application/json' }));
    a.download = `russian-trainer-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    $('#bk-msg').textContent = 'Saved to your downloads.';
  };
  $('#bk-in').onclick = () => $('#bk-file').click();
  $('#bk-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { backup.import(await f.text()); $('#bk-msg').textContent = 'Imported. Reloading…'; setTimeout(() => location.reload(), 600); }
    catch (err) { $('#bk-msg').textContent = err.message; }
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});  // ask the browser not to evict progress

  /* ---------- today strip: which parts of the app you used today ---------- */
  const ACT = 'ru-activity-v1', MAP = { 'ru-trainer-state-v1': 'study', 'ru-extras-v1': 'practice', 'ru-read-v1': 'reading' };
  const rawSet = Storage.prototype.setItem;
  const readAct = () => { try { return JSON.parse(localStorage.getItem(ACT)) || {}; } catch (e) { return {}; } };
  function strip() {
    const a = readAct(), t = today(), d = a[t] || {};
    let n = 0, c = new Date(); if (!a[today()]) c.setDate(c.getDate() - 1);
    const iso = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    while (a[iso(c)] && Object.keys(a[iso(c)]).length) { n++; c.setDate(c.getDate() - 1); }
    const dot = (k, l) => `<span style="margin-right:.7rem">${d[k] ? '✓' : '○'} ${l}</span>`;
    el.innerHTML = dot('study', 'Lesson / quiz / review') + dot('practice', 'Practice') + dot('reading', 'Reading') + `<span>🔥 ${n}-day streak</span>`;
  }
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === localStorage && MAP[k]) { const a = readAct(), t = today(); a[t] = a[t] || {}; a[t][MAP[k]] = 1; rawSet.call(localStorage, ACT, JSON.stringify(a)); strip(); }
  };
  const el = document.createElement('div');
  el.id = 'today'; el.style.cssText = 'font-size:.78rem;opacity:.85;margin:.4rem 0 0';
  const bar = document.querySelector('.prog'); bar.parentNode.insertBefore(el, bar.nextSibling);
  strip();

  const more = document.createElement('div');
  more.style.cssText = 'width:100%;margin-top:.6rem;font-size:.85rem';
  const lk = (h, l) => `<a href="${h}" target="_blank" rel="noopener" style="color:inherit">${l}</a>`;
  more.innerHTML = '<b>Beyond the app</b><br>Listen daily: ' + lk('https://www.youtube.com/results?search_query=Easy+Russian+street+interviews', 'street interviews with subtitles') +
    '<br>More words: ' + lk('https://ankiweb.net/shared/decks?search=russian%20frequency', 'Anki frequency decks') +
    '<br>Speaking: ' + lk('https://www.italki.com/en/teachers/russian', 'a weekly tutor session');
  $('#set').appendChild(more);
})();
