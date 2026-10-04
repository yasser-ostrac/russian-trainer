/* Dictionary XL + translator.
   - Offline dictionary of ~45,000 Russian words with stress marks, English meanings, every inflected form
     and a frequency rank (data/dict.tsv, from OpenRussian.org, CC BY-SA 4.0).
   - Search Russian or English; inflected forms work (книги finds книга). Results are sorted by how common the word is.
   - Translate: word-by-word gloss of any sentence, offline. Known course sentences are translated fully.
   - Common: the most frequent words, with the ones you already learn in the course marked, so you can see what to learn next.
   - Your own lessons, packs, dialogues and texts are indexed too (course words are marked, examples come from your sentences).
   - Select any Russian word anywhere in the app and a "Look up" button appears. */
(() => {
  const h = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
  const POS = { n: 'noun', v: 'verb', a: 'adjective', o: 'word' };
  const isRu = s => /[а-яё]/i.test(s);

  // spelling-based romanisation (stress-aware), used when the dictionary has no hand-written transliteration
  const RM = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: "'", э: 'e' };
  const IOT = { е: 'e', ю: 'u', я: 'a' }, AC = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý' }, CV = 'аеёиоуыэюя';
  // soft vowels after a soft-able consonant are written with y (nyé, myá), like the transliterations in the course
  function roman(s) {
    const t = s.normalize('NFC').toLowerCase(), out = []; let lv = -1;
    for (let j = 0; j < t.length; j++) {
      const c = t[j];
      if (c === '\u0301') { if (lv >= 0) { const v = out[lv]; out[lv] = v.slice(0, -1) + (AC[v[v.length - 1]] || v[v.length - 1]); } continue; }
      const pc = j ? t[j - 1] : '', iot = !pc || 'аеёиоуыэюяъь- '.includes(pc) || ('бвгдзйклмнпрстфх'.includes(pc));
      let r;
      if (c === 'ё') r = (iot ? 'y' : '') + 'ó';
      else if (IOT[c]) r = (iot ? 'y' : '') + IOT[c];
      else r = RM[c] !== undefined ? RM[c] : c;
      out.push(r);
      if (CV.includes(c)) lv = out.length - 1;
    }
    return out.join('');
  }
  const loose = s => lat(s).replace(/'/g, '').replace(/y(?=[aeiou])/g, '');

  let E = null, SEN = [], byK = new Map(), D = null, P = null, tab = 'search', q = '', shown = 40, cpage = 0, hideKnown = true;

  /* ---------- index everything the app itself knows (lessons, packs, Basics, dialogues, texts) ---------- */
  async function buildApp() {
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
    byK = new Map(E.map(e => [e.k, e]));
    SEN.forEach(s => { s.w = words(s.ru); });
  }

  /* ---------- the big dictionary (data/dict.tsv) ---------- */
  async function loadBig() {
    try {
      const r = await fetch('data/dict.tsv', { cache: 'no-cache' });
      if (!r.ok) throw new Error('missing');
      const L = (await r.text()).split('\n');
      const d = { n: 0, bare: [], acc: [], pos: [], info: [], en: [], enl: [], rk: [], k: [], st: [], su: [], stO: [], suO: [], idx: new Map(), forms: 0, ens: null, enw: null };
      for (let i = 0; i < L.length; i++) {
        const f = L[i].split('\t'); if (f.length < 7) continue;
        const k = cyr(f[0]), c = f[6].indexOf(':'), j = d.n++;
        d.bare.push(f[0]); d.acc.push(f[1]); d.pos.push(f[2]); d.info.push(f[3]); d.en.push(f[4]); d.enl.push(f[4].toLowerCase());
        d.rk.push(+f[5] || 0); d.k.push(k);
        const stO = c > 0 ? f[6].slice(0, c) : '', su = c >= 0 ? f[6].slice(c + 1) : '';
        d.stO.push(stO); d.suO.push(su);
        d.st.push(stO.replace(/ё/g, 'е'));
        d.su.push(su ? (' ' + su + ' ').replace(/ё/g, 'е') : '');
        if (su) d.forms += su.split(' ').length;
        const a = d.idx.get(k); if (a) a.push(j); else d.idx.set(k, [j]);
      }
      d.byRank = []; for (let i = 0; i < d.n; i++) if (d.rk[i]) d.byRank.push(i);
      d.byRank.sort((a, b) => d.rk[a] - d.rk[b] || a - b);
      D = d;
    } catch (e) { D = null; }
  }
  const build = () => P || (P = buildApp().then(loadBig));

  // is word w (normalised) a form of dictionary entry i?  1 = the entry itself, 2 = an inflected form
  function isForm(i, w) {
    if (D.k[i] === w) return 1;
    const su = D.su[i]; if (!su) return 0;
    const st = D.st[i]; if (!w.startsWith(st)) return 0;
    return su.includes(' ' + (w.length === st.length ? '-' : w.slice(st.length)) + ' ') ? 2 : 0;
  }
  const srcOf = k => { const e = byK.get(k); return e ? e.src : []; };
  const rkey = x => (x.rk ? x.rk : 1e9);

  function viewBig(i, r) {
    const k = D.k[i], app = byK.get(k);
    return { r, i, k, ru: D.bare[i], acc: D.acc[i], tr: app && app.tr ? app.tr : roman(D.acc[i]), en: D.en[i], pos: D.pos[i], info: D.info[i], rk: D.rk[i], src: app ? app.src : [] };
  }
  const viewApp = (e, r) => ({ r, i: null, k: e.k, ru: e.ru, acc: e.ru, tr: e.tr, en: e.en, pos: e.k.includes(' ') ? 'phrase' : 'o', info: '', rk: 0, src: e.src, app: e });

  /* ---------- lookups ---------- */
  function search(raw) {
    const s = (raw || '').trim(); if (!s || !E) return [];
    const out = [];
    if (isRu(s)) {
      const c = cyr(s), multi = c.includes(' '), have = new Set();
      if (D && !multi) {
        for (let i = 0; i < D.n; i++) {
          const k = D.k[i]; let r = 0;
          if (k === c) r = 1; else if (isForm(i, c)) r = 2; else if (c.length >= 2 && k.startsWith(c)) r = 3; else if (c.length >= 4 && k.includes(c)) r = 5;
          if (r) { out.push(viewBig(i, r)); have.add(k); }
        }
      }
      const st = stem(s);
      E.forEach(e => {
        if (have.has(e.k) || (D && !e.k.includes(' ') && D.idx.has(e.k) && !multi)) return;
        let r = 0;
        if (e.k === c) r = 1; else if (e.k.startsWith(c)) r = 3; else if (!D && st.length >= 3 && e.st === st) r = 2; else if (c.length >= 3 && e.k.includes(c)) r = 4;
        if (r) out.push(viewApp(e, r));
      });
    } else {
      const l = lat(s).replace(/\s+/g, ' ').trim();
      if (D) {
        if (!D.ens) { D.ens = D.enl.map(x => ';' + x.replace(/\s*[;,]\s*/g, ';') + ';'); D.enw = D.enl.map(x => ' ' + x.replace(/[^a-z0-9']+/g, ' ') + ' '); }
        for (let i = 0; i < D.n; i++) {
          let r = 0;
          if (D.ens[i].includes(';' + l + ';')) r = 1; else if (D.enw[i].includes(' ' + l + ' ')) r = 2; else if (l.length >= 2 && D.enw[i].includes(' ' + l)) r = 3; else if (l.length >= 3 && D.enl[i].includes(l)) r = 4;
          if (r) out.push(viewBig(i, r));
        }
      }
      if (D && !out.length) {
        if (!D.rom) D.rom = D.acc.map(a => loose(roman(a)));
        const lr = loose(l);
        for (let i = 0; i < D.n; i++) { const m = D.rom[i]; const r = m === lr ? 1 : lr.length >= 3 && m.startsWith(lr) ? 3 : 0; if (r) out.push(viewBig(i, r)); }
      }
      E.forEach(e => {
        const en = e.en.toLowerCase(), tr = lat(e.tr), ws = en.split(/[^a-z0-9']+/); let r = 0;
        if (tr === l) r = 1; else if (!D && (en === l || ws.includes(l))) r = 2; else if (l.length >= 3 && tr.startsWith(l)) r = 3;
        if (r && !out.some(x => x.k === e.k)) out.push(viewApp(e, r));
      });
    }
    // substring matches are noisy: keep them only when there are few real matches
    const good = out.filter(x => x.r <= 3).length;
    const res = good ? out.filter(x => x.r <= 3 || (x.r === 4 && good < 3)) : out;
    return res.sort((a, b) => a.r - b.r || (a.src.length ? 0 : 1) - (b.src.length ? 0 : 1) || rkey(a) - rkey(b) || a.ru.length - b.ru.length);
  }
  function examples(v) {
    if (v.i != null && D) return SEN.filter(s => s.w.some(w => isForm(v.i, w))).slice(0, 4);
    const e = v.app || byK.get(v.k); if (!e) return [];
    return SEN.filter(s => e.k.includes(' ') ? s.k.includes(e.k) : s.st.has(e.st)).slice(0, 4);
  }
  function formsOf(i) {
    const st = D.stO[i], l = D.suO[i].trim().split(' ').filter(Boolean).map(x => st + (x === '-' ? '' : x));
    return [D.bare[i], ...l].filter((x, j, a) => a.indexOf(x) === j);
  }
  function cands(w) {
    const out = [];
    if (!D) return out;
    const ex = D.idx.get(w) || [];
    ex.forEach(i => out.push(viewBig(i, 1)));
    for (let i = 0; i < D.n; i++) if (!ex.includes(i) && isForm(i, w) === 2) out.push(viewBig(i, 2));
    return out.sort((a, b) => a.r - b.r || (a.src.length ? 0 : 1) - (b.src.length ? 0 : 1) || rkey(a) - rkey(b)).slice(0, 3);
  }
  const short = s => (s.length > 90 ? s.slice(0, s.lastIndexOf(',', 90) > 20 ? s.lastIndexOf(',', 90) : 90) + ' …' : s);

  function gloss(t) {
    const rows = [];
    if (isRu(t)) {
      const norm = x => words(x).join(' '), n = norm(t), known = SEN.find(s => norm(s.ru) === n);
      if (known) rows.push(`<div class="note"><b>Known sentence:</b> ${h(known.en)} <i>(${h(known.src)})</i></div>`);
      E.filter(e => e.k.includes(' ') && (' ' + n + ' ').includes(' ' + e.k + ' ')).forEach(e => rows.push(`<div class="ph"><div><b>${h(e.ru)}</b> <i>${h(e.tr)}</i><br>${h(e.en)} <i>(phrase)</i></div></div>`));
      const byS = new Map(); E.forEach(e => { if (!e.k.includes(' ') && !byS.has(e.st)) byS.set(e.st, e); });
      words(t).forEach(w => {
        let line = '';
        const cs = cands(w);
        if (cs.length) {
          line = cs.map((v, j) => `${j ? '<br>' : ''}${j ? '<i>or</i> ' : ''}→ <b>${h(v.acc)}</b> <i>${h(POS[v.pos])}${v.info ? ', ' + h(v.info) : ''}</i> ${v.r === 1 ? '✓' : '≈'}<br>${h(short(v.en))}${v.src.length ? ' <i>· in your course</i>' : ''}`).join('');
        } else {
          const sm = byK.get(w) || byS.get(stem(w));
          line = sm ? `→ ${h(sm.ru)} <i>${h(sm.tr)}</i><br>${h(sm.en)} <i>${byK.get(w) ? '✓' : '≈'}</i>` : '<br><i>not found, try Wiktionary</i>';
          if (!sm) line += ` <a class="mini" style="text-decoration:none;color:inherit" target="_blank" rel="noopener" href="${wik(w)}">↗</a>`;
        }
        rows.push(`<div class="ph"><button class="play" data-dt-say="${h(w)}" aria-label="Play">▶</button><div><b>${h(w)}</b> ${line}</div></div>`);
      });
    } else {
      (lat(t).match(/[a-z']+/g) || []).filter(w => w.length > 1).forEach(w => {
        const r = search(w).slice(0, 3);
        rows.push(`<div class="ph"><div><b>${h(w)}</b> → ${r.length ? r.map(e => `${h(e.acc)} <i>${h(e.tr)}</i>`).join(' · ') : '<i>no match</i>'}</div></div>`);
      });
    }
    return rows.join('') || '<div class="empty">Type something first.</div>';
  }

  /* ---------- screens ---------- */
  const tagOf = v => [POS[v.pos] || v.pos, v.info, v.rk ? '#' + v.rk + ' most common' : '', v.src.length ? '✓ in your course: ' + v.src.join(', ') : ''].filter(Boolean).join(' · ');
  function result(v) {
    return `<div class="ph" data-ru="${h(v.ru)}"><button class="play" data-dt-say="${h(v.ru)}" aria-label="Play">▶</button>
      <div><b>${h(v.acc)}</b> <i>${h(v.tr)}</i><br>${h(v.en)}<br><i>${h(tagOf(v))}</i>
        <div style="margin-top:6px"><button class="mini" data-dt-ex="${h(v.k)}" data-i="${v.i == null ? '' : v.i}">Examples</button>${v.i != null && D.su[v.i] ? ` <button class="mini" data-dt-forms="${v.i}">Forms</button>` : ''} <a class="mini" style="text-decoration:none;color:inherit" target="_blank" rel="noopener" href="${wik(v.ru)}" aria-label="Wiktionary">↗</a></div>
        <div class="dt-ex"></div></div></div>`;
  }
  function runSearch() {
    const box = $('#dres'); if (!box) return;
    if (!q.trim()) { box.innerHTML = `<div class="empty">Type Russian or English. Inflected forms work too (книги finds книга).</div>${D ? `<div class="note">${D.n.toLocaleString()} words and ${D.forms.toLocaleString()} word forms offline. Results are sorted by how common the word is.</div>` : '<div class="note">The big dictionary file is not downloaded yet. Open this screen once with internet and it will work offline afterwards. For now only words from your own lessons are searched.</div>'}`; return; }
    const r = search(q);
    box.innerHTML = r.length ? r.slice(0, shown).map(result).join('') + (r.length > shown ? `<button class="done-btn" data-dt-more="1">Show more (${r.length - shown} left)</button>` : '') + attrib()
      : `<div class="empty">Nothing found for “${h(q)}”.<br><a href="${wik(q)}" target="_blank" rel="noopener" style="color:inherit">Try Wiktionary ↗</a> · <a href="${gt(q, isRu(q))}" target="_blank" rel="noopener" style="color:inherit">Google Translate ↗</a></div>`;
  }
  const attrib = () => '<div class="note" style="font-size:.75rem">Dictionary data: <a href="https://en.openrussian.org" target="_blank" rel="noopener" style="color:inherit">OpenRussian.org</a>, CC BY-SA 4.0. Romanisation is generated from the spelling, so vowel reduction is not shown.</div>';

  function commonView() {
    if (!D) return '<section class="card"><div class="empty">The big dictionary is not downloaded yet. Open this screen once with internet.</div></section>';
    const all = D.byRank, know = i => byK.has(D.k[i]);
    const cov = n => { const top = all.filter(i => D.rk[i] <= n); return top.length ? Math.round(100 * top.filter(know).length / top.length) : 0; };
    const list = all.filter(i => !hideKnown || !know(i)), per = 40, pages = Math.max(1, Math.ceil(list.length / per));
    cpage = Math.min(cpage, pages - 1);
    const rows = list.slice(cpage * per, cpage * per + per).map(i => `<div class="ph"><button class="play" data-dt-say="${h(D.bare[i])}" aria-label="Play">▶</button><div><b>${h(D.acc[i])}</b> <i>#${D.rk[i]} · ${h(POS[D.pos[i]])}${know(i) ? ' · ✓ in your course' : ''}</i><br>${h(short(D.en[i]))}</div><button class="mini" data-dt-open="${h(D.bare[i])}">Open</button></div>`).join('');
    return `<section class="card"><h3><span>Most common words</span><i>your course covers ${cov(1000)}% of the top 1,000 · ${cov(2000)}% of the top 2,000 · ${cov(5000)}% of the top 5,000</i></h3>
      <label style="display:block;margin:8px 0"><input type="checkbox" data-dt-hide="1" ${hideKnown ? 'checked' : ''}> Hide words I already learn in the course</label>
      ${rows || '<div class="empty">Nothing left on this list.</div>'}
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="mini" data-dt-page="-1" ${cpage ? '' : 'disabled'}>← Prev</button><span style="align-self:center">${cpage + 1} / ${pages}</span><button class="mini" data-dt-page="1" ${cpage < pages - 1 ? '' : 'disabled'}>Next →</button></div></section>${attrib()}`;
  }
  function draw() {
    const inp = `style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:1.05rem;margin-bottom:8px"`;
    const tabs = [['search', 'Search'], ['trans', 'Translate'], ['common', 'Common']].map(([k, l]) => `<button data-dt-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('');
    V().innerHTML = `<section class="hero"><small>Dictionary</small><h2>Look up &amp; translate</h2></section><div class="weeks">${tabs}</div>
      ${tab === 'search'
        ? `<section class="card"><input id="dq" ${inp} placeholder="Russian or English" autocomplete="off" autocapitalize="off" spellcheck="false" value="${h(q)}"><div id="dres"></div></section>`
        : tab === 'trans'
        ? `<section class="card"><textarea id="dtx" rows="4" ${inp} placeholder="Type or paste Russian or English">${h(q)}</textarea>
            <button class="done-btn" data-dt-gloss="1">Word by word (offline)</button>
            <div style="display:flex;gap:8px;margin-top:8px"><button class="mini" data-dt-hear="1">▶ Hear it</button><a class="mini" id="dgt" style="text-decoration:none;color:inherit" target="_blank" rel="noopener" href="${gt(q, isRu(q))}">Full translation ↗</a></div>
            <div id="dout" style="margin-top:10px"></div>
            <div class="note">Word by word is a gloss, not a real translation: Russian word order and endings change the meaning. “Full translation” opens Google Translate (needs internet).</div></section>`
        : commonView()}`;
    if (tab === 'search') runSearch();
    else if (tab === 'trans' && q.trim()) $('#dout').innerHTML = gloss(q);
  }
  async function open(query) {
    mode = 'dict';
    document.querySelectorAll('.modes button').forEach(x => x.classList.remove('on'));
    $('#planbar').style.display = $('#nav').style.display = 'none';
    if (typeof query === 'string') { q = query; tab = 'search'; shown = 40; }
    V().innerHTML = '<div class="empty">Loading dictionary…</div>';
    await build(); draw(); window.scrollTo({ top: 0 });
    const i = $('#dq'); if (i && !('ontouchstart' in window)) i.focus();
  }

  V().addEventListener('click', e => {
    if (mode !== 'dict') return;
    const g = s => e.target.closest(s); let b;
    if ((b = g('[data-dt-say]'))) return say(b.dataset.dtSay);
    if ((b = g('[data-dt-tab]'))) { tab = b.dataset.dtTab; return draw(); }
    if ((b = g('[data-dt-open]'))) return open(b.dataset.dtOpen);
    if ((b = g('[data-dt-page]'))) { cpage = Math.max(0, cpage + +b.dataset.dtPage); draw(); return window.scrollTo({ top: 0 }); }
    if (g('[data-dt-hide]')) { hideKnown = !hideKnown; cpage = 0; return draw(); }
    if (g('[data-dt-more]')) { shown += 40; return runSearch(); }
    if ((b = g('[data-dt-forms]'))) {
      const box = b.closest('.ph').querySelector('.dt-ex'), i = +b.dataset.dtForms;
      if (box.dataset.mode === 'forms') { box.innerHTML = ''; box.dataset.mode = ''; return; }
      box.dataset.mode = 'forms';
      box.innerHTML = `<div style="margin-top:6px"><i>${formsOf(i).slice(0, 80).map(h).join(' · ')}</i><br><i style="font-size:.75rem">Forms are shown without stress marks.</i></div>`;
      return;
    }
    if ((b = g('[data-dt-ex]'))) {
      const box = b.closest('.ph').querySelector('.dt-ex');
      if (box.dataset.mode === 'ex') { box.innerHTML = ''; box.dataset.mode = ''; return; }
      box.dataset.mode = 'ex';
      const v = b.dataset.i !== '' ? { i: +b.dataset.i, k: b.dataset.dtEx } : { i: null, k: b.dataset.dtEx }, ex = examples(v);
      box.innerHTML = ex.length ? ex.map(s => `<div style="margin-top:6px"><button class="mini" data-dt-say="${h(s.ru)}">▶</button> ${h(s.ru)}<br><i>${h(s.en)} · ${h(s.src)}</i></div>`).join('') : '<div style="margin-top:6px"><i>No example sentence in the app yet.</i></div>';
      return;
    }
    if (g('[data-dt-gloss]')) { q = $('#dtx').value; $('#dout').innerHTML = gloss(q); $('#dgt').href = gt(q, isRu(q)); return; }
    if (g('[data-dt-hear]')) { const t = $('#dtx').value; if (isRu(t)) say(t); return; }
  });
  let inTimer;
  V().addEventListener('input', e => {
    if (mode !== 'dict') return;
    if (e.target.id === 'dq') { q = e.target.value; shown = 40; clearTimeout(inTimer); inTimer = setTimeout(runSearch, 120); }
    if (e.target.id === 'dtx') { q = e.target.value; const a = $('#dgt'); if (a) a.href = gt(q, isRu(q)); }
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
