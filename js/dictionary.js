/* Dictionary + translator. Searches everything in the app offline (lessons, word packs, Basics, dialogues, texts),
   glosses a sentence word by word, links to Wiktionary / Google Translate for anything else,
   and shows a "Look up" button when you select a Russian word anywhere. */
(() => {
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cyr = s => s.normalize('NFC').replace(/\u0301/g, '').toLowerCase().replace(/ё/g, 'е');
  const lat = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const END = ['ыми', 'ими', 'ого', 'его', 'ому', 'ему', 'ами', 'ями', 'ешь', 'ишь', 'ете', 'ите', 'ают', 'яют', 'ует',
    'ют', 'ут', 'ят', 'ат', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ой', 'ей', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ью', 'ть', 'ет', 'ит', 'им', 'ла', 'ло', 'ли', 'ся', 'сь',
    'у', 'ю', 'а', 'я', 'о', 'е', 'ы', 'и', 'ь', 'й', 'л'];
  const stem1 = w => { for (const e of END) if (w.length - e.length >= 3 && w.endsWith(e)) return w.slice(0, -e.length); return w; };
  const stem = w => stem1(stem1(cyr(w)));
  const words = s => cyr(s).match(/[а-я]+(?:-[а-я]+)*/g) || [];
  const V = () => $('#view');
  const wik = w => `https://en.wiktionary.org/wiki/${encodeURIComponent(w)}#Russian`;
  const gt = (t, ru) => `https://translate.google.com/?sl=${ru ? 'ru&tl=en' : 'en&tl=ru'}&text=${encodeURIComponent(t)}&op=translate`;

  let E = null, SEN = [], tab = 'search', q = '';

  /* ---------- index everything the app knows ---------- */
  async function build() {
    if (E) return;
    const map = new Map(); SEN = [];
    const add = (ru, tr, en, src) => {
      if (!ru || !en) return; const k = cyr(ru); let e = map.get(k);
      if (!e) map.set(k, e = { ru, tr: tr || '', en: [], src: [], k, st: k.includes(' ') ? k : stem(ru) });
      if (!e.en.includes(en)) e.en.push(en); if (!e.tr && tr) e.tr = tr; if (e.src.length < 3 && !e.src.includes(src)) e.src.push(src);
    };
    const sen = (ru, en, src) => { if (ru && en) SEN.push({ ru, en, src, k: cyr(ru), st: new Set(words(ru).map(stem)) }); };
    const text = async p => { try { const r = await fetch(p, { cache: 'no-cache' }); return r.ok ? await r.text() : ''; } catch (e) { return ''; } };
    const lines = t => t.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).map(l => l.split(' | ').map(x => x.trim()));
    const pairs = b => (b || '').split(';').map(s => s.split('=').map(x => x.trim()));

    try { (await Backend.handle('/api/days')).forEach(d => { d.vocab.forEach(v => add(v.ru, v.tr, v.en, 'Day ' + d.day)); d.phrases.forEach(p => sen(p.ru, p.en, 'Day ' + d.day)); }); } catch (e) {}
    lines(await text('data/words.txt')).forEach(([t, b]) => pairs(b).forEach(([ru, tr, en]) => add(ru, tr, en, 'Pack: ' + t)));
    for (const [f, label] of [['dialogues', 'Dialogue'], ['texts', 'Text']]) lines(await text(`data/${f}.txt`)).forEach(([t, b]) => pairs(b).forEach(([ru, en]) => sen(ru, en, `${label}: ${t}`)));
    try {
      const R = JSON.parse(await text('data/reference.json'));
      (R.alphabet || []).forEach(a => add(a[3], a[4], a[5], 'Alphabet'));
      (R.numbers || []).forEach(n => add(n[1], n[2], String(n[0]), 'Numbers'));
      [['days', 'Days'], ['months', 'Months'], ['words', 'Time words']].forEach(([k, l]) => (R[k] || []).forEach(a => add(a[0], a[1], a[2], l)));
    } catch (e) {}
    // Small words and pronoun forms the lessons never list as vocabulary (makes sentence glosses far more useful)
    ('я=ya=I;ты=ty=you (informal);он=on=he;она=aná=she;оно=anó=it;мы=my=we;вы=vy=you (plural / formal);они=aní=they;меня=minyá=me (accusative / genitive);мне=mnye=to me;мной=mnoy=by / with me;' +
      'тебя=tibyá=you (accusative / genitive);тебе=tibyé=to you;его=yivó=him / his;ему=yimú=to him;её=yiyó=her / hers;ей=yey=to her;нас=nas=us;нам=nam=to us;вас=vas=you (plural, accusative / genitive);вам=vam=to you (plural);их=ikh=them / their;им=im=to them;' +
      'мой=moy=my (m);моя=mayá=my (f);моё=mayó=my (n);мои=mayí=my (plural);твой=tvoy=your (m);наш=nash=our (m);ваш=vash=your (plural, m);этот=état=this (m);эта=éta=this (f);это=éta=this / it is;эти=éti=these;' +
      'не=nye=not;и=i=and;а=a=and / but;но=no=but;или=íli=or;в=v=in / into;на=na=on / to;с=s=with;к=k=to / towards;по=po=along / by;из=iz=from / out of;от=at=from;до=do=until / to;за=za=behind / for;для=dlya=for;без=byez=without;о=o=about;у=u=at / by;при=pri=at / during;' +
      'да=da=yes;нет=nyet=no / there is not;там=tam=there;тут=tut=here;здесь=zdyes\'=here;очень=óchin\'=very;уже=uzhé=already;тоже=tózhe=also;только=tól\'ka=only;же=zhe=emphasis (so / after all);ли=li=question particle (whether);бы=by=would (conditional);' +
      'что=shto=what / that;кто=kto=who;как=kak=how / like;где=gdye=where;когда=kagdá=when;почему=pachimú=why;который=katóryy=which / who').split(';').forEach(x => { const [ru, tr, en] = x.split('='); add(ru, tr, en, 'Basic words'); });
    E = [...map.values()].map(e => ({ ...e, en: e.en.join(' / ') }));
  }

  /* ---------- lookups ---------- */
  function search(raw) {
    const s = (raw || '').trim(); if (!s || !E) return [];
    const out = [];
    if (/[а-яё]/i.test(s)) {
      const c = cyr(s), st = stem(s);
      E.forEach(e => { let r = 0;
        if (e.k === c) r = 1; else if (e.k.startsWith(c)) r = 2; else if (st.length >= 3 && e.st === st) r = 3; else if (c.length >= 3 && e.k.includes(c)) r = 4;
        if (r) out.push([r, e]); });
    } else {
      const l = lat(s);
      E.forEach(e => { const en = e.en.toLowerCase(), tr = lat(e.tr), ws = en.split(/[^a-z0-9']+/); let r = 0;
        if (en === l || tr === l) r = 1; else if (ws.includes(l)) r = 2; else if (l.length >= 2 && ws.some(w => w.startsWith(l))) r = 3; else if (l.length >= 3 && (en.includes(l) || tr.startsWith(l))) r = 4;
        if (r) out.push([r, e]); });
    }
    return out.sort((a, b) => a[0] - b[0] || a[1].ru.length - b[1].ru.length).slice(0, 40).map(x => x[1]);
  }
  const examples = e => SEN.filter(s => e.k.includes(' ') ? s.k.includes(e.k) : s.st.has(e.st)).slice(0, 3);

  function gloss(t) {
    const rows = [];
    if (/[а-яё]/i.test(t)) {
      const norm = x => words(x).join(' '), n = norm(t), known = SEN.find(s => norm(s.ru) === n);
      if (known) rows.push(`<div class="note"><b>Known sentence:</b> ${h(known.en)} <i>(${h(known.src)})</i></div>`);
      const byK = new Map(E.map(e => [e.k, e])), byS = new Map(); E.forEach(e => { if (!e.k.includes(' ') && !byS.has(e.st)) byS.set(e.st, e); });
      E.filter(e => e.k.includes(' ') && (' ' + n + ' ').includes(' ' + e.k + ' ')).forEach(e => rows.push(`<div class="ph"><div><b>${h(e.ru)}</b> <i>${h(e.tr)}</i><br>${h(e.en)} <i>(phrase)</i></div></div>`));
      words(t).forEach(w => {
        const ex = byK.get(w), sm = ex || byS.get(stem(w)), mark = ex ? '✓' : sm ? '≈' : '?';
        rows.push(`<div class="ph"><button class="play" data-dt-say="${h(w)}" aria-label="Play">▶</button><div><b>${h(w)}</b> ${sm ? `→ ${h(sm.ru)} <i>${h(sm.tr)}</i><br>${h(sm.en)}` : '<br><i>not in the app, try Wiktionary</i>'} <i>${mark}</i></div>${sm ? '' : `<a class="mini" style="text-decoration:none;color:inherit" target="_blank" rel="noopener" href="${wik(w)}">↗</a>`}</div>`);
      });
    } else {
      (lat(t).match(/[a-z']+/g) || []).filter(w => w.length > 1).forEach(w => {
        const r = search(w).slice(0, 3);
        rows.push(`<div class="ph"><div><b>${h(w)}</b> → ${r.length ? r.map(e => `${h(e.ru)} <i>${h(e.tr)}</i>`).join(' · ') : '<i>no match in the app</i>'}</div></div>`);
      });
    }
    return rows.join('') || '<div class="empty">Type something first.</div>';
  }

  /* ---------- screens ---------- */
  function result(e) {
    return `<div class="ph" data-ru="${h(e.ru)}"><button class="play" data-dt-say="${h(e.ru)}" aria-label="Play">▶</button>
      <div><b>${h(e.ru)}</b> <i>${h(e.tr)}</i><br>${h(e.en)}<br><i>${h(e.src.join(' · '))}</i><div class="dt-ex"></div></div>
      <button class="mini" data-dt-ex="${h(e.k)}">Examples</button><a class="mini" style="text-decoration:none;color:inherit;margin-left:4px" target="_blank" rel="noopener" href="${wik(e.ru)}" aria-label="Wiktionary">↗</a></div>`;
  }
  function runSearch() {
    const r = search(q), box = $('#dres'); if (!box) return;
    box.innerHTML = !q.trim() ? '<div class="empty">Type Russian or English. Inflected forms work too (книги finds книга).</div>'
      : r.length ? r.map(result).join('') + '<div class="note">Only words from this app are listed. Anything else: tap ↗ for Wiktionary.</div>'
      : `<div class="empty">Nothing in the app for “${h(q)}”.<br><a href="${wik(q)}" target="_blank" rel="noopener" style="color:inherit">Try Wiktionary ↗</a> · <a href="${gt(q, /[а-яё]/i.test(q))}" target="_blank" rel="noopener" style="color:inherit">Google Translate ↗</a></div>`;
  }
  function draw() {
    const inp = `style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:1.05rem;margin-bottom:8px"`;
    V().innerHTML = `<section class="hero"><small>Dictionary</small><h2>Look up &amp; translate</h2></section>
      <div class="weeks"><button data-dt-tab="search" class="${tab === 'search' ? 'on' : ''}">Search</button><button data-dt-tab="trans" class="${tab === 'trans' ? 'on' : ''}">Translate</button></div>
      ${tab === 'search'
        ? `<section class="card"><input id="dq" ${inp} placeholder="Russian or English" autocomplete="off" autocapitalize="off" spellcheck="false" value="${h(q)}"><div id="dres"></div></section>`
        : `<section class="card"><textarea id="dtx" rows="4" ${inp} placeholder="Type or paste Russian or English">${h(q)}</textarea>
            <button class="done-btn" data-dt-gloss="1">Word by word (offline)</button>
            <div style="display:flex;gap:8px;margin-top:8px"><button class="mini" data-dt-hear="1">▶ Hear it</button><a class="mini" id="dgt" style="text-decoration:none;color:inherit" target="_blank" rel="noopener" href="${gt(q, /[а-яё]/i.test(q))}">Full translation ↗</a></div>
            <div id="dout" style="margin-top:10px"></div>
            <div class="note">Word by word is a gloss, not a real translation: Russian word order and endings change the meaning. “Full translation” opens Google Translate (needs internet).</div></section>`}`;
    if (tab === 'search') runSearch();
    else if (q.trim()) $('#dout').innerHTML = gloss(q);
  }
  async function open(query) {
    mode = 'dict';
    document.querySelectorAll('.modes button').forEach(x => x.classList.remove('on'));
    $('#planbar').style.display = $('#nav').style.display = 'none';
    if (typeof query === 'string') { q = query; tab = 'search'; }
    await build(); draw(); window.scrollTo({ top: 0 });
    const i = $('#dq'); if (i && !('ontouchstart' in window)) i.focus();
  }

  V().addEventListener('click', e => {
    if (mode !== 'dict') return;
    const g = s => e.target.closest(s); let b;
    if ((b = g('[data-dt-say]'))) return say(b.dataset.dtSay);
    if ((b = g('[data-dt-tab]'))) { tab = b.dataset.dtTab; return draw(); }
    if ((b = g('[data-dt-ex]'))) {
      const row = b.closest('.ph'), box = row.querySelector('.dt-ex'), ent = E.find(x => x.k === b.dataset.dtEx);
      if (box.innerHTML) { box.innerHTML = ''; return; }
      const ex = examples(ent);
      box.innerHTML = ex.length ? ex.map(s => `<div style="margin-top:6px"><button class="mini" data-dt-say="${h(s.ru)}">▶</button> ${h(s.ru)}<br><i>${h(s.en)} · ${h(s.src)}</i></div>`).join('') : '<div style="margin-top:6px"><i>No example sentence in the app yet.</i></div>';
      return;
    }
    if (g('[data-dt-gloss]')) { q = $('#dtx').value; $('#dout').innerHTML = gloss(q); $('#dgt').href = gt(q, /[а-яё]/i.test(q)); return; }
    if (g('[data-dt-hear]')) { const t = $('#dtx').value; if (/[а-яё]/i.test(t)) say(t); return; }
  });
  V().addEventListener('input', e => {
    if (mode !== 'dict') return;
    if (e.target.id === 'dq') { q = e.target.value; runSearch(); }
    if (e.target.id === 'dtx') { q = e.target.value; const a = $('#dgt'); if (a) a.href = gt(q, /[а-яё]/i.test(q)); }
  });

  /* ---------- entry points: a button next to the gear, and "Look up" for selected Russian text ---------- */
  const btn = document.createElement('button');
  btn.id = 'dict-btn'; btn.className = 'gear'; btn.textContent = '🔍 Dictionary'; btn.style.marginRight = '6px';
  const gear = $('#gear'), wrap = document.createElement('span');
  gear.parentNode.insertBefore(wrap, gear); wrap.append(btn, gear);
  btn.onclick = () => open();

  const pop = document.createElement('button');
  pop.id = 'dict-pop'; pop.className = 'mini';
  pop.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:30;display:none;padding:10px 16px;box-shadow:0 2px 12px rgba(0,0,0,.3);background:var(--card);color:var(--fg)';
  document.body.appendChild(pop);
  let timer, picked = '';
  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const sel = window.getSelection(), t = sel ? String(sel).trim() : '';
      const ok = /^[А-Яа-яЁё\u0301-]{2,30}( [А-Яа-яЁё\u0301-]{1,30}){0,2}$/.test(t) && sel.anchorNode && V().contains(sel.anchorNode) && mode !== 'dict';
      picked = ok ? t : ''; pop.style.display = ok ? 'block' : 'none'; if (ok) pop.textContent = '🔍 Look up «' + t + '»';
    }, 250);
  });
  pop.onmousedown = e => e.preventDefault();
  pop.onclick = () => { const t = picked; pop.style.display = 'none'; window.getSelection().removeAllRanges(); open(t); };
  window.RuDict = { open, search: s => search(s), gloss, ready: build };
})();
