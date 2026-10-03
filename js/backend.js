/* On-device backend: port of app.py + quiz.py. State lives in localStorage, no server. */
function createBackend(DAYS, meta) {
  const STAGES = [['Stage 1 · Survival (A1)', 1, 30], ['Stage 2 · Everyday (A2)', 31, 60], ['Stage 3 · Conversation (B1)', 61, 90]];
  const INTERVALS = [0, 1, 2, 4, 7, 15];
  DAYS.forEach(d => { d.stage = STAGES.find(s => s[1] <= d.day && d.day <= s[2])[0]; });

  /* ---------- dates (local time) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => fmt(new Date());
  const now = () => { const d = new Date(); return `${fmt(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return fmt(new Date(y, m - 1, d + n)); };

  /* ---------- storage ---------- */
  const KEY = 'ru-trainer-state-v1';
  let S = { progress: {}, cards: {}, events: [], items: {} };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  // Cards get stable ids from content order (new days appended later get new ids)
  const CARDS = [];
  const seen = new Set();
  DAYS.forEach(d => d.vocab.forEach(v => {
    const key = d.day + '|' + v.ru;
    if (seen.has(key)) return;
    seen.add(key);
    CARDS.push({ id: CARDS.length + 1, key, day: d.day, ru: v.ru, tr: v.tr, en: v.en });
  }));
  const cs = c => S.cards[c.key] || { box: 0, due: '0000-00-00' };

  /* ---------- quiz.py ---------- */
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const shuffled = a => shuffle(a.slice());
  const level = xp => Math.floor(Math.sqrt(xp / 50)) + 1;
  const streak = isoDays => {
    const s = new Set(isoDays);
    let d = today();
    if (!s.has(d)) d = addDays(d, -1);
    let n = 0;
    while (s.has(d)) { n++; d = addDays(d, -1); }
    return n;
  };

  const items = days => {
    const out = [];
    days.forEach(d => {
      d.vocab.forEach(v => out.push({ ru: v.ru, en: v.en, p: false, d: d.day }));
      d.phrases.forEach(p => out.push({ ru: p.ru, en: p.en, p: true, d: d.day }));
    });
    return out;
  };

  function questions(its, pool) {
    const order = ['ru2en', 'listen', 'en2ru', 'build'];
    const qs = [];
    its.forEach((it, i) => {
      let t = order[i % 4];
      if (t === 'build' && !(it.p && it.ru.split(/\s+/).length >= 3)) t = ['ru2en', 'listen', 'en2ru'][i % 3];
      if (t === 'build') {
        const toks = it.ru.split(/\s+/);
        const tiles = toks.slice();
        const distinct = new Set(toks).size > 1;
        while (distinct && tiles.every((x, k) => x === toks[k])) shuffle(tiles);
        qs.push({ type: 'build', prompt: it.en, tiles, answer: toks, speak: it.ru, ru: it.ru, day: it.d, bonus: !!it.bonus });
        return;
      }
      const key = (t === 'ru2en' || t === 'listen') ? 'en' : 'ru';
      const cands = pool.filter(x => x.ru !== it.ru && x.en !== it.en);
      const same = cands.filter(x => x.p === it.p);
      const wrong = [];
      for (const x of shuffled(same).concat(shuffled(cands))) {
        if (x[key] !== it[key] && !wrong.includes(x[key])) wrong.push(x[key]);
        if (wrong.length === 3) break;
      }
      const opts = shuffle([it[key]].concat(wrong));
      const prompt = { ru2en: it.ru, en2ru: it.en, listen: 'Listen and choose the meaning' }[t];
      qs.push({ type: t, prompt, speak: t === 'en2ru' ? null : it.ru, options: opts, answer: opts.indexOf(it[key]),
        ru: it.ru, day: it.d, bonus: !!it.bonus });
    });
    shuffle(qs);
    return qs.filter(x => !x.bonus).concat(qs.filter(x => x.bonus));
  }

  function makeQuiz(scope, poolDays, n) {
    let its = shuffle(items(scope));
    const reps = Math.ceil(n / its.length);
    let big = [];
    for (let i = 0; i < reps; i++) big = big.concat(its);
    return questions(big.slice(0, n), items(poolDays));
  }

  function makeDayQuiz(day, wrongMap) {
    const todayIts = shuffle(items([DAYS[day - 1]]));
    const used = new Set(todayIts.map(x => x.ru));
    const earlier = [];
    const earlierSeen = new Set();
    items(DAYS.slice(0, day - 1)).forEach(x => {
      if (!used.has(x.ru) && !earlierSeen.has(x.ru)) { earlier.push(x); earlierSeen.add(x.ru); }
    });
    shuffle(earlier);
    earlier.sort((a, b) => (wrongMap[b.ru] || 0) - (wrongMap[a.ru] || 0));
    const core = earlier.length ? todayIts.slice(0, 6).concat(earlier.slice(0, 4)) : todayIts.concat(todayIts).slice(0, 10);
    core.forEach(x => used.add(x.ru));
    let bonus = [];
    items(DAYS.slice(day, day + 2)).forEach(x => {
      if (!used.has(x.ru) && !x.p) bonus.push(Object.assign({}, x, { bonus: true }));
    });
    bonus = shuffled(bonus).slice(0, 3);
    shuffle(core);
    return questions(core.concat(bonus), items(DAYS.slice(0, day + 2)));
  }

  /* ---------- app.py ---------- */
  const blocks = () => {
    const n = DAYS.length, out = [];
    for (let k = 1; k <= Math.floor((n + 6) / 7); k++)
      out.push(['week', k, `Week ${k} exam · days ${7 * k - 6}-${Math.min(7 * k, n)}`, 7 * k - 6, Math.min(7 * k, n), 0.8, 20]);
    STAGES.forEach(([name, a, b], i) => out.push(['stage', i + 1, name + ' exam', a, b, 0.75, 30]));
    return out;
  };
  const findBlock = (kind, ref) => blocks().find(b => b[0] === kind && b[1] === ref) || null;
  const isDone = day => S.progress[day] === 1;
  const hasEvent = (kind, ref, passedOnly) => S.events.some(e => e.kind === kind && e.ref === ref && (!passedOnly || e.passed === 1));
  const stats = () => {
    const xp = S.events.reduce((a, e) => a + e.xp, 0);
    return { xp, level: level(xp), streak: streak(S.events.map(e => e.ts.slice(0, 10))) };
  };
  const completeDay = day => {
    S.progress[day] = 1;
    if (!hasEvent('complete', day)) S.events.push({ kind: 'complete', ref: day, correct: null, total: null, passed: 0, xp: 20, ts: now() });
  };

  const routes = {
    days: () => DAYS,
    info: () => meta,
    progress: () => ({ done: Object.keys(S.progress).filter(d => S.progress[d] === 1).map(Number).sort((a, b) => a - b) }),
    setProgress(day, body) {
      if (!(day >= 1 && day <= DAYS.length)) return { error: 'bad day' };
      if (body.done) completeDay(day); else S.progress[day] = 0;
      save();
      return { day, done: !!body.done };
    },
    review() {
      const t = today();
      return CARDS.filter(c => isDone(c.day) && cs(c).due <= t)
        .sort((a, b) => cs(a).box - cs(b).box || (cs(a).due < cs(b).due ? -1 : cs(a).due > cs(b).due ? 1 : 0) || a.id - b.id)
        .slice(0, 20)
        .map(c => ({ id: c.id, ru: c.ru, tr: c.tr, en: c.en, box: cs(c).box, day: c.day }));
    },
    grade(id, body) {
      if (!['again', 'good', 'easy'].includes(body.grade)) return { error: 'grade must be again|good|easy' };
      const c = CARDS[id - 1];
      if (!c) return { error: 'no such card' };
      let box = cs(c).box;
      const top = INTERVALS.length - 1;
      box = body.grade === 'again' ? 0 : body.grade === 'good' ? Math.min(box + 1, top) : Math.min(box + 2, top);
      const due = addDays(today(), INTERVALS[box]);
      S.cards[c.key] = { box, due };
      save();
      return { id, box, due };
    },
    tests() {
      const exams = blocks().map(([kind, ref, label, a, b, need]) => {
        const tries = S.events.filter(e => e.kind === kind && e.ref === ref && e.total > 0);
        const best = tries.length ? Math.max(...tries.map(e => Math.floor(e.correct * 100 / e.total))) : null;
        let note, ok;
        if (b > DAYS.length) { note = 'Content coming soon'; ok = false; }
        else if (![...Array(b - a + 1).keys()].every(i => isDone(a + i))) { note = `Complete days ${a}-${b} to unlock`; ok = false; }
        else { note = `Pass mark ${Math.round(need * 100)}%` + (best !== null ? ` · best ${best}%` : ''); ok = true; }
        return { kind, ref, label, unlocked: ok, note };
      });
      return { stats: stats(), exams };
    },
    quiz(kind, ref) {
      if (kind === 'day' && ref >= 1 && ref <= DAYS.length) {
        const wrong = {};
        Object.keys(S.items).forEach(ru => { if (S.items[ru].wrong > 0) wrong[ru] = S.items[ru].wrong; });
        return { kind, ref, need: 0.7, questions: makeDayQuiz(ref, wrong) };
      }
      const b = findBlock(kind, ref);
      if (!b || b[4] > DAYS.length) return { error: 'not available' };
      return { kind, ref, need: b[5], questions: makeQuiz(DAYS.slice(b[3] - 1, b[4]), DAYS.slice(0, b[4]), b[6]) };
    },
    attempt(j) {
      const kind = j.kind, ref = j.ref;
      const correct = parseInt(j.correct, 10), total = parseInt(j.total, 10);
      if (isNaN(correct) || isNaN(total)) return { error: 'bad numbers' };
      if (!['day', 'week', 'stage'].includes(kind) || !Number.isInteger(ref) || total <= 0 || correct < 0 || correct > total) return { error: 'bad attempt' };
      const b = kind !== 'day' ? findBlock(kind, ref) : null;
      const need = b ? b[5] : 0.7;
      const passed = correct / total >= need;
      const firstPass = kind !== 'day' && passed && !hasEvent(kind, ref, true);
      const bonus = Math.max(0, Math.min(parseInt(j.bonus || 0, 10) || 0, 5));
      const xp = correct * 10 + bonus * 5 + (firstPass ? 50 : 0);
      S.events.push({ kind, ref, correct, total, passed: passed ? 1 : 0, xp, ts: now() });
      (j.results || []).slice(0, 60).forEach(r => {
        const ru = String(r.ru || '').slice(0, 80), ok = !!r.ok;
        if (!ru) return;
        const it = S.items[ru] || (S.items[ru] = { seen: 0, wrong: 0 });
        it.seen += 1; if (!ok) it.wrong += 1;
        if (!ok) CARDS.filter(c => c.ru === ru).forEach(c => { S.cards[c.key] = { box: 0, due: today() }; });
      });
      const completed = kind === 'day' && passed && ref >= 1 && ref <= DAYS.length;
      if (completed) completeDay(ref);
      save();
      return { completed, xp, pct: Math.round(100 * correct / total), passed, stats: stats() };
    },
  };

  function dispatch(url, body) {
    body = body || {};
    let m;
    if (url === '/api/days') return routes.days();
    if (url === '/api/info') return routes.info();
    if (url === '/api/progress') return routes.progress();
    if ((m = url.match(/^\/api\/progress\/(\d+)$/))) return routes.setProgress(+m[1], body);
    if (url === '/api/review') return routes.review();
    if ((m = url.match(/^\/api\/review\/(\d+)$/))) return routes.grade(+m[1], body);
    if (url === '/api/tests') return routes.tests();
    if ((m = url.match(/^\/api\/quiz\/(\w+)\/(\d+)$/))) return routes.quiz(m[1], +m[2]);
    if (url === '/api/attempt') return routes.attempt(body);
    return { error: 'unknown route' };
  }

  return { handle: (url, body) => Promise.resolve().then(() => dispatch(url, body)), _state: () => S };
}

/* ---------- lesson loading: data/days.json + data/days_extra.txt, parsed in the browser ---------- */
function parseExtra(text, start) {
  // One day per line: title | lesson | task | ru=tr=en; ... | ru=en; ...   (# = comment)
  const days = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    try {
      const parts = line.split(' | ').map(x => x.trim());
      if (parts.length !== 5) throw new Error('needs 5 parts separated by " | ", found ' + parts.length);
      const [title, lesson, task, vocab, phr] = parts;
      const v = vocab.split(';').map(s => s.split('=').map(x => x.trim()));
      const p = phr.split(';').map(s => s.split('=').map(x => x.trim()));
      if (v.some(a => a.length !== 3 || a.some(x => !x))) throw new Error('vocab must be ru=translit=en');
      if (p.some(a => a.length !== 2 || a.some(x => !x))) throw new Error('phrases must be ru=en');
      days.push({ day: start + days.length, title, rest: title.startsWith('Review'), lesson, task,
        vocab: v.map(a => ({ ru: a[0], tr: a[1], en: a[2] })), phrases: p.map(a => ({ ru: a[0], en: a[1] })) });
    } catch (e) {
      // Stop here so later day numbers (and your progress) never shift.
      return { days, error: `days_extra.txt line ${i + 1}: ${e.message}. Lessons after it are not loaded.` };
    }
  }
  return { days, error: null };
}

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36).slice(0, 6); };

const Backend = (() => {
  const get = async path => {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.text();
  };
  const ready = (async () => {
    const baseText = await get('data/days.json');
    let extraText = '';
    try { extraText = await get('data/days_extra.txt'); } catch (e) {}
    const base = JSON.parse(baseText);
    const extra = parseExtra(extraText, base.length + 1);
    const days = base.concat(extra.days);
    return createBackend(days, { days: days.length, version: hash(baseText + extraText), error: extra.error });
  })();
  return { handle: (url, body) => ready.then(be => be.handle(url, body)), ready };
})();
