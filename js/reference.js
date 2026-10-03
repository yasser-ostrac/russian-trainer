const Basics = (() => {
  let R = null, sub = 'alpha';
  const V = () => $('#view');

  /*NUM*/
  const U = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const TN = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const TY = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const H = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  function under1000(n, fem) {
    const h = Math.floor(n / 100), r = n % 100, t = Math.floor(r / 10), u = r % 10, p = [H[h]];
    if (r >= 10 && r < 20) p.push(TN[r - 10]);
    else { p.push(TY[t]); if (u) p.push(fem && u === 1 ? 'одна' : fem && u === 2 ? 'две' : U[u]); }
    return p.filter(Boolean).join(' ');
  }
  function words(n) {
    if (n === 0) return U[0];
    const th = Math.floor(n / 1000), rest = n % 1000, out = [];
    if (th === 1) out.push('тысяча');
    else if (th) {
      const l = th % 10, l2 = th % 100;
      out.push(under1000(th, true), l2 >= 11 && l2 <= 14 ? 'тысяч' : l === 1 ? 'тысяча' : l >= 2 && l <= 4 ? 'тысячи' : 'тысяч');
    }
    if (rest) out.push(under1000(rest, false));
    return out.join(' ');
  }
  /*END*/

  const grid = (title, arr, all) => `<section class="card"><h3><span>${title}</span><button class="mini" data-all="${all}">▶ All</button></h3>
    <div class="vg">${arr.map(([ru, tr, en]) => `<button class="v" data-t="${esc(ru)}"><b>${ru}</b><span>${tr}</span><i>${en}</i></button>`).join('')}</div></section>`;

  function alpha() {
    return `<section class="card"><h3><span>33 letters · tap a letter, ▶ for a word</span><button class="mini" data-all="alpha">▶ Words</button></h3>` +
      R.alphabet.map(([l, name, snd, w, tr, en]) => `<div class="ph"><button class="lt" data-t="${l}">${l}${l.toLowerCase()}</button>
        <div><b>${name}</b><i>sounds like ${snd}</i><br><i>${w} · ${tr} · ${en}</i></div>
        <button class="play" data-t="${w}" aria-label="Play">▶</button></div>`).join('') + '</section>';
  }
  function num() {
    return `<section class="card"><h3><span>Hear any number (0 to 999999)</span></h3>
      <div class="numtool"><input id="nin" type="number" min="0" max="999999" inputmode="numeric" placeholder="e.g. 2026"><button class="mini" id="nsay">▶ Say</button></div>
      <div class="note" id="nout"></div></section>
      ${grid('Core numbers', R.numbers.map(([n, ru, tr]) => [ru, tr, n]), 'num')}
      <section class="card note">Build the rest by combining: 21 = <b>двадцать один</b>, 35 = <b>тридцать пять</b>, 140 = <b>сто сорок</b>. One and two change for feminine nouns (одна, две).</section>`;
  }
  function days() {
    const now = new Date(), d = R.days[(now.getDay() + 6) % 7], m = R.months[now.getMonth()], line = `Сегодня ${d[0]}. Сейчас ${m[0]}.`;
    return `<section class="card"><h3><span>Today</span></h3><div class="ph"><button class="play" data-t="${line}" aria-label="Play">▶</button>
      <div><b>${line}</b><i>Today is ${d[2]}. It is ${m[2]} now.</i></div></div></section>
      ${grid('Days of the week', R.days, 'days')}${grid('Time words', R.words, 'words')}
      <section class="card note">"On Monday" = <b>в понедельник</b>. Days and months are not capitalised in Russian.</section>`;
  }
  function months() {
    return `${grid('Months', R.months, 'months')}<section class="card note">"In January" = <b>в январе</b>. Dates use another form: <b>первое января</b> (1 January), which you will meet in Stage 2.</section>`;
  }
  function draw() {
    const tabs = [['alpha', 'Alphabet'], ['num', 'Numbers'], ['days', 'Days'], ['months', 'Months']];
    V().innerHTML = `<div class="weeks">${tabs.map(([k, l]) => `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${l}</button>`).join('')}</div>` +
      { alpha, num, days, months }[sub]();
  }
  async function open() {
    if (!R) {
      try { R = await (await fetch('data/reference.json')).json(); }
      catch (e) { V().innerHTML = '<div class="card empty">Could not load the Basics data.</div>'; return; }
    }
    draw();
  }
  function speakNum() {
    const v = Math.max(0, Math.min(999999, parseInt($('#nin').value, 10) || 0)), w = words(v);
    $('#nout').innerHTML = `<b>${v}</b> = ${w}`; say(w);
  }
  V().addEventListener('click', e => {
    if (mode !== 'basics') return;
    const t = e.target.closest('[data-t]'); if (t) return say(t.dataset.t);
    const s = e.target.closest('[data-sub]'); if (s) { sub = s.dataset.sub; return draw(); }
    if (e.target.closest('#nsay')) return speakNum();
    const a = e.target.closest('[data-all]');
    if (a) {
      const k = a.dataset.all, list = k === 'alpha' ? R.alphabet.map(x => x[3]) : k === 'num' ? R.numbers.map(x => x[1]) : R[k].map(x => x[0]);
      sayAll(list);
    }
  });
  V().addEventListener('keydown', e => { if (mode === 'basics' && e.key === 'Enter' && e.target.id === 'nin') speakNum(); });
  return { open };
})();
