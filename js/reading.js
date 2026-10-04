/* Reading tab: short graded texts (data/texts.txt). One line = one text:  Title | ru=en; ru=en; ...  Own state in localStorage. */
(() => {
  const KEY = 'ru-read-v1';
  let S = { done: {} }, T = [], err = [], loaded = false;
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const V = () => $('#view');

  async function load() {
    if (loaded) return; loaded = true;
    try {
      const r = await fetch('data/texts.txt', { cache: 'no-cache' });
      if (!r.ok) throw new Error('missing');
      (await r.text()).split(/\r?\n/).forEach((l, i) => {
        if (!l.trim() || l.startsWith('#')) return;
        try {
          const [title, body] = l.split(' | ').map(x => x.trim());
          const ss = body.split(';').map(s => s.split('=').map(x => x.trim()));
          if (!title || !ss.length || ss.some(a => a.length !== 2 || a.some(x => !x))) throw 0;
          T.push({ title, lines: ss.map(([ru, en]) => ({ ru, en })) });
        } catch (e) { err.push(`texts.txt line ${i + 1} is malformed and was skipped`); }
      });
    } catch (e) { err.push('data/texts.txt not found'); }
  }

  const weekCount = () => {
    const lim = new Date(); lim.setDate(lim.getDate() - 6); const from = iso(lim);
    return Object.values(S.done).filter(d => d >= from).length;
  };

  function home() {
    const next = T.findIndex(t => !S.done[t.title]);
    const rows = T.map((t, i) => `<div class="ph"><div><b>${t.title}${i === next ? ' ← next' : ''}</b><i>${t.lines.length} sentences${S.done[t.title] ? ' · read ✓ ' + S.done[t.title] : ''}</i></div><button class="mini" data-text="${i}">Open</button></div>`).join('');
    V().innerHTML = `<section class="hero"><small>Reading</small><h2>One short text a day</h2></section>
      ${err.length ? `<div class="card empty">${err.join('<br>')}</div>` : ''}
      <section class="card"><h3><span>Texts</span><i>${weekCount()} read in the last 7 days</i></h3>${rows || '<div class="empty">No texts.</div>'}
        <div class="note">Try to understand each sentence first, then tap it to check the English. Listen with ▶ and read along.</div></section>`;
  }

  function textView(i) {
    const t = T[i], done = S.done[t.title];
    V().innerHTML = `<section class="hero"><small>Reading · tap a sentence to see the English</small><h2>${t.title}</h2></section>
      <section class="card"><h3><span>${t.lines.length} sentences</span><button class="mini" data-readall="${i}">▶ All</button></h3>
      ${t.lines.map(l => `<div class="ph" data-line="1"><button class="play" data-t="${esc(l.ru)}" aria-label="Play">▶</button><div><b>${l.ru}</b><i class="en" style="display:none">${l.en}</i></div></div>`).join('')}</section>
      <button class="done-btn" data-markread="${i}">${done ? 'Read ✓ (' + done + ') · mark again today' : 'I read it ✓'}</button>
      <button class="mini" data-home="1" style="display:block;margin:12px auto">← Back</button>`;
  }

  V().addEventListener('click', e => {
    if (mode !== 'reading') return;
    const g = s => e.target.closest(s); let b;
    if ((b = g('[data-t]'))) return say(b.dataset.t);
    if ((b = g('[data-text]'))) return textView(+b.dataset.text);
    if ((b = g('[data-readall]'))) return sayAll(T[+b.dataset.readall].lines.map(l => l.ru));
    if ((b = g('[data-markread]'))) { S.done[T[+b.dataset.markread].title] = iso(new Date()); save(); return home(); }
    if (g('[data-home]')) return home();
    if ((b = g('.ph[data-line]'))) { const en = b.querySelector('.en'); en.style.display = en.style.display === 'none' ? 'block' : 'none'; }
  });

  const btn = document.createElement('button');
  btn.id = 'm-reading'; btn.textContent = 'Reading'; $('.modes').appendChild(btn);
  btn.onclick = async () => {
    mode = 'reading';
    document.querySelectorAll('.modes button').forEach(x => x.classList.toggle('on', x === btn));
    $('#planbar').style.display = $('#nav').style.display = 'none';
    await load(); home(); window.scrollTo({ top: 0 });
  };
  ['#m-plan', '#m-basics', '#m-rev', '#m-tests', '#m-practice'].forEach(s => { const x = $(s); if (x) x.addEventListener('click', () => btn.classList.remove('on')); });
})();
