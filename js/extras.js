/* Practice tab: word packs (data/words.txt) + dialogues (data/dialogues.txt). Own state in localStorage. */
(() => {
  const KEY = 'ru-extras-v1', INT = [0, 1, 2, 4, 7, 15];
  let S = { cards: {}, dlg: {} }, P = [], DL = [], err = [], loaded = false;
  let Q = [], qi = 0, sc = 0, locked = false, meta = null, hide = false;
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
  const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const V = () => $('#view');
  const allWords = () => P.flatMap(p => p.words);

  /* ---------- loading (one line = one pack / dialogue; a bad line is reported, the rest still load) ---------- */
  async function load() {
    if (loaded) return; loaded = true;
    const get = async p => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p); return r.text(); };
    const each = (text, f, name) => text.split(/\r?\n/).forEach((l, i) => {
      if (!l.trim() || l.startsWith('#')) return;
      try { f(l.split(' | ').map(x => x.trim())); } catch (e) { err.push(`${name} line ${i + 1} is malformed and was skipped`); }
    });
    try {
      each(await get('data/words.txt'), ([title, w]) => {
        const ws = w.split(';').map(s => s.split('=').map(x => x.trim()));
        if (!title || ws.some(a => a.length !== 3 || a.some(x => !x))) throw 0;
        P.push({ title, words: ws.map(([ru, tr, en]) => ({ ru, tr, en, pack: title })) });
      }, 'words.txt');
    } catch (e) { err.push('data/words.txt not found'); }
    try {
      each(await get('data/dialogues.txt'), ([title, b]) => {
        const ls = b.split(';').map(s => s.split('=').map(x => x.trim()));
        if (!title || ls.length < 4 || ls.length % 2 || ls.some(a => a.length !== 2 || a.some(x => !x))) throw 0;
        DL.push({ title, lines: ls.map(([ru, en]) => ({ ru, en })) });
      }, 'dialogues.txt');
    } catch (e) { err.push('data/dialogues.txt not found'); }
  }

  /* ---------- questions ---------- */
  function wordQs(words) {
    const t = today(), pool = allWords(), types = ['ru2en', 'listen', 'en2ru'];
    const score = w => { const c = S.cards[w.pack + '|' + w.ru]; return c ? (c.due <= t ? c.box : 100 + c.box) : 0.5; };
    return shuf(words).sort((a, b) => score(a) - score(b)).slice(0, 10).map((w, i) => {
      const ty = types[i % 3], key = ty === 'en2ru' ? 'ru' : 'en', wrong = [];
      for (const x of shuf(pool)) {
        if (x.ru !== w.ru && x.en !== w.en && x[key] !== w[key] && !wrong.includes(x[key])) wrong.push(x[key]);
        if (wrong.length === 3) break;
      }
      const opts = shuf([w[key]].concat(wrong));
      return { t: ty, prompt: ty === 'ru2en' ? w.ru : ty === 'en2ru' ? w.en : 'Listen and choose the meaning',
        speak: ty === 'en2ru' ? null : w.ru, opts, ans: opts.indexOf(w[key]), card: w.pack + '|' + w.ru, tr: w.tr };
    });
  }
  function replyQs(d) {
    const others = DL.filter(x => x !== d).flatMap(x => x.lines.filter((_, i) => i % 2)).filter(x => x.ru.split(' ').length >= 3);
    const qs = [];
    for (let i = 0; i + 1 < d.lines.length; i += 2) {
      const a = d.lines[i], b = d.lines[i + 1], wrong = [];
      for (const x of shuf(others)) { if (x.ru !== b.ru && !wrong.includes(x.ru)) wrong.push(x.ru); if (wrong.length === 3) break; }
      const opts = shuf([b.ru].concat(wrong));
      qs.push({ t: 'reply', prompt: a.ru, en: a.en, speak: a.ru, opts, ans: opts.indexOf(b.ru), reply: b });
    }
    return qs;
  }
  function grade(key, ok) {
    const c = S.cards[key] || { box: 0, due: today() };
    c.box = ok ? Math.min(c.box + 1, INT.length - 1) : 0; c.due = addDays(today(), INT[c.box]);
    S.cards[key] = c; save();
  }

  /* ---------- quiz screens ---------- */
  function start(qs, m) { Q = qs; qi = 0; sc = 0; meta = m; if (Q.length) showQ(); }
  function showQ() {
    const q = Q[qi]; locked = false;
    const prompt = q.t === 'reply' ? (hide ? 'Listen and choose the reply' : q.prompt) : q.prompt;
    V().innerHTML = `<section class="card fc"><small>${meta.label} · ${qi + 1}/${Q.length}</small>
      <div class="qp">${q.speak ? `<button class="play" data-t="${esc(q.speak)}" aria-label="Play">▶</button>` : ''}<b>${prompt}</b></div>
      ${q.opts.map((o, k) => `<button class="opt" data-o="${k}">${o}</button>`).join('')}<div id="fb"></div></section>`;
    if (q.speak && (q.t === 'listen' || q.t === 'reply')) say(q.speak);
  }
  function answer(k) {
    const q = Q[qi]; if (locked) return; locked = true;
    const ok = k === q.ans, bs = document.querySelectorAll('.opt'); if (ok) sc++;
    bs[k].classList.add(ok ? 'ok' : 'bad'); bs[q.ans].classList.add('ok');
    if (q.card) grade(q.card, ok);
    const note = q.t === 'reply' ? `<br><i>${q.en}</i> → <i>${q.reply.en}</i>` : q.tr ? ` · ${q.tr}` : '';
    $('#fb').innerHTML = `<div class="ans ${ok ? 'okt' : 'badt'}">${ok ? '✓ Correct' : '✗ ' + q.opts[q.ans]}${note}</div>
      <button class="done-btn" data-nx="1">${qi + 1 < Q.length ? 'Next' : 'Finish'}</button>`;
  }
  function finish() {
    if (meta.dlg) { const d = S.dlg[meta.dlg] || { best: 0, tries: 0 }; d.best = Math.max(d.best, sc); d.tries++; S.dlg[meta.dlg] = d; save(); }
    V().innerHTML = `<section class="hero"><small>${meta.label}</small><h2>${sc} / ${Q.length}</h2></section>
      <section class="card fc"><div class="grades"><button data-again="1">Again</button><button class="good" data-home="1">Done</button></div></section>`;
  }

  /* ---------- browse screens ---------- */
  const back = '<button class="mini" data-home="1" style="display:block;margin:12px auto">← Back</button>';
  function home() {
    const rows = P.map((p, i) => {
      const seen = p.words.filter(w => S.cards[w.pack + '|' + w.ru]).length;
      return `<div class="ph"><div><b>${p.title}</b><i>${p.words.length} words · ${seen} practised</i></div><button class="mini" data-pack="${i}">Open</button></div>`;
    }).join('');
    const drows = DL.map((d, i) => {
      const s = S.dlg[d.title];
      return `<div class="ph"><div><b>${d.title}</b><i>${d.lines.length / 2} replies${s ? ' · best ' + s.best + '/' + d.lines.length / 2 : ''}</i></div><button class="mini" data-dlg="${i}">Open</button></div>`;
    }).join('');
    V().innerHTML = `<section class="hero"><small>Practice</small><h2>Words &amp; dialogues</h2></section>
      ${err.length ? `<div class="card empty">${err.join('<br>')}</div>` : ''}
      <section class="card"><h3><span>Word packs</span><button class="mini" data-prac="all">▶ Practise 10</button></h3>${rows || '<div class="empty">No packs.</div>'}</section>
      <section class="card"><h3><span>Dialogues</span></h3>${drows || '<div class="empty">No dialogues.</div>'}
        <label class="note"><input type="checkbox" id="hide" ${hide ? 'checked' : ''}> Listening mode: hide the Russian text in reply practice</label></section>`;
  }
  function packView(i) {
    const p = P[i];
    V().innerHTML = `<section class="hero"><small>Word pack</small><h2>${p.title}</h2></section>
      <section class="card"><h3><span>${p.words.length} words</span><button class="mini" data-playall="p:${i}">▶ All</button></h3>
      <div class="vg">${p.words.map(w => `<button class="v" data-t="${esc(w.ru)}"><b>${w.ru}</b><span>${w.tr}</span><i>${w.en}</i></button>`).join('')}</div></section>
      <button class="done-btn" data-prac="${i}">Practise this pack (10 questions)</button>${back}`;
  }
  function dlgView(i) {
    const d = DL[i];
    V().innerHTML = `<section class="hero"><small>Dialogue · tap a line to see the English</small><h2>${d.title}</h2></section>
      <section class="card"><h3><span>Listen first</span><button class="mini" data-playall="d:${i}">▶ All</button></h3>
      ${d.lines.map((l, k) => `<div class="ph" data-line="1"><button class="play" data-t="${esc(l.ru)}" aria-label="Play">▶</button>
        <div><b><span class="tag">${k % 2 ? 'B' : 'A'}</span>${l.ru}</b><i class="en" style="display:none">${l.en}</i></div></div>`).join('')}</section>
      <button class="done-btn" data-reply="${i}">Practise the replies (${d.lines.length / 2} questions)</button>${back}`;
  }

  /* ---------- wiring ---------- */
  V().addEventListener('click', e => {
    if (mode !== 'practice') return;
    const g = s => e.target.closest(s); let b;
    if ((b = g('[data-t]'))) return say(b.dataset.t);
    if ((b = g('[data-pack]'))) return packView(+b.dataset.pack);
    if ((b = g('[data-dlg]'))) return dlgView(+b.dataset.dlg);
    if ((b = g('[data-prac]'))) {
      const k = b.dataset.prac, words = k === 'all' ? allWords() : P[+k].words, label = k === 'all' ? 'Mixed words' : P[+k].title;
      const run = () => start(wordQs(words), { label, restart: run }); return run();
    }
    if ((b = g('[data-reply]'))) {
      const d = DL[+b.dataset.reply], run = () => start(replyQs(d), { label: d.title, dlg: d.title, restart: run }); return run();
    }
    if ((b = g('[data-playall]'))) { const [k, i] = b.dataset.playall.split(':'); return sayAll(k === 'p' ? P[+i].words.map(w => w.ru) : DL[+i].lines.map(l => l.ru)); }
    if (g('[data-nx]')) { qi++; return qi < Q.length ? showQ() : finish(); }
    if ((b = g('[data-o]'))) return answer(+b.dataset.o);
    if (g('[data-home]')) return home();
    if (g('[data-again]')) return meta.restart();
    if ((b = g('.ph[data-line]'))) { const en = b.querySelector('.en'); en.style.display = en.style.display === 'none' ? 'block' : 'none'; }
  });
  V().addEventListener('change', e => { if (mode === 'practice' && e.target.id === 'hide') hide = e.target.checked; });

  const btn = document.createElement('button');
  btn.id = 'm-practice'; btn.textContent = 'Practice'; $('.modes').appendChild(btn);
  btn.onclick = async () => {
    mode = 'practice';
    document.querySelectorAll('.modes button').forEach(x => x.classList.toggle('on', x === btn));
    $('#planbar').style.display = $('#nav').style.display = 'none';
    await load(); home(); window.scrollTo({ top: 0 });
  };
  ['#m-plan', '#m-basics', '#m-rev', '#m-tests'].forEach(s => { const x = $(s); if (x) x.addEventListener('click', () => btn.classList.remove('on')); });
})();
