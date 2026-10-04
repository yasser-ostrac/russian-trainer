/* Adds "Test yourself" to every text in the Reading tab: pick the meaning of sentences, then type what you hear.
   It needs no extra content: questions are built from data/texts.txt. Does not edit reading.js. */
(() => {
  let T = null, Q = [], qi = 0, sc = 0, cur = null, locked = false;
  const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const V = () => $('#view');

  async function texts() {
    if (T) return T;
    T = [];
    try {
      const r = await fetch('data/texts.txt', { cache: 'no-cache' });
      (await r.text()).split(/\r?\n/).forEach(l => {
        if (!l.trim() || l.startsWith('#')) return;
        const [title, body] = l.split(' | ').map(x => x.trim());
        if (title && body) T.push({ title, lines: body.split(';').map(s => s.split('=').map(x => x.trim())).filter(a => a.length === 2) });
      });
    } catch (e) {}
    return T;
  }

  function build(t) {
    const others = T.filter(x => x !== t).flatMap(x => x.lines);
    const pick = shuf(t.lines), qs = [];
    pick.slice(0, 3).forEach(([ru, en]) => {
      const wrong = shuf(others).filter(o => o[1] !== en).slice(0, 3).map(o => o[1]);
      const opts = shuf([en].concat(wrong));
      qs.push({ t: 'mean', ru, opts, ans: opts.indexOf(en) });
    });
    shuf(t.lines).filter(l => l[0].split(' ').length >= 3).slice(0, 3).forEach(([ru, en]) => qs.push({ t: 'dict', ru, en }));
    return qs;
  }

  function show() {
    const q = Q[qi]; locked = false;
    const head = `<small>${cur.title} · ${qi + 1}/${Q.length}</small>`;
    if (q.t === 'mean') {
      V().innerHTML = `<section class="card fc">${head}<div class="qp"><button class="play" data-t="${esc(q.ru)}" aria-label="Play">▶</button><b>${q.ru}</b></div>
        ${q.opts.map((o, k) => `<button class="opt" data-rc-o="${k}">${o}</button>`).join('')}<div id="fb"></div></section>`;
    } else {
      V().innerHTML = `<section class="card fc">${head}<div class="qp"><button class="play" data-t="${esc(q.ru)}" aria-label="Play">▶</button><b>Type what you hear</b></div>
        <input id="rc-in" lang="ru" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:1.05rem">
        <button class="done-btn" data-rc-check="1">Check</button><div id="fb"></div></section>`;
      setTimeout(() => { const i = $('#rc-in'); if (i) i.focus(); }, 50);
    }
    say(q.ru);
  }
  function result(ok, right, en) {
    locked = true; if (ok) sc++;
    $('#fb').innerHTML = `<div class="ans ${ok ? 'okt' : 'badt'}">${ok ? '✓ Correct' : '✗ ' + right}${en ? `<br><i>${en}</i>` : ''}</div>
      <button class="done-btn" data-rc-nx="1">${qi + 1 < Q.length ? 'Next' : 'Finish'}</button>`;
  }
  function finish() {
    V().innerHTML = `<section class="hero"><small>${cur.title}</small><h2>${sc} / ${Q.length}</h2></section>
      <section class="card fc"><div class="grades"><button data-rc-again="1">Again</button><button class="good" data-rc-back="1">Done</button></div></section>`;
  }

  // Add the button whenever a text is on screen
  new MutationObserver(() => {
    if (mode !== 'reading' || $('#rc-btn')) return;
    const mark = V().querySelector('[data-markread]'); if (!mark) return;
    const b = document.createElement('button');
    b.id = 'rc-btn'; b.className = 'done-btn'; b.dataset.rcStart = '1'; b.style.marginBottom = '8px';
    b.textContent = 'Test yourself (6 questions)';
    mark.parentNode.insertBefore(b, mark);
  }).observe(V(), { childList: true });

  V().addEventListener('click', async e => {
    if (mode !== 'reading') return;
    const g = s => e.target.closest(s); let b;
    if (g('[data-rc-start]')) {
      await texts();
      const h = V().querySelector('.hero h2'); cur = T.find(t => t.title === (h && h.textContent.trim()));
      if (!cur) return;
      const run = () => { Q = build(cur); qi = 0; sc = 0; show(); }; cur.run = run; return run();
    }
    if ((b = g('[data-rc-o]'))) {
      if (locked) return; const q = Q[qi], k = +b.dataset.rcO, ok = k === q.ans, bs = document.querySelectorAll('.opt');
      bs[k].classList.add(ok ? 'ok' : 'bad'); bs[q.ans].classList.add('ok'); return result(ok, q.opts[q.ans], '');
    }
    if (g('[data-rc-check]')) { if (locked) return; const q = Q[qi]; return result(norm($('#rc-in').value) === norm(q.ru), q.ru, q.en); }
    if (g('[data-rc-nx]')) { qi++; return qi < Q.length ? show() : finish(); }
    if (g('[data-rc-again]')) return cur.run();
    if (g('[data-rc-back]')) { const m = $('#m-reading'); return m && m.click(); }
  });
  V().addEventListener('keydown', e => { if (mode === 'reading' && e.key === 'Enter' && e.target.id === 'rc-in' && !locked) V().querySelector('[data-rc-check]').click(); });
})();
