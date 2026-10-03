const Tests = (() => {
  const offlineMsg = '<div class="card empty">You are offline. Quizzes and progress need a connection.<br>The Plan and Basics tabs still work.</div>';
  let Q = [], i = 0, score = 0, meta = null, locked = false, picked = [], bank = [], results = [], bonusOk = 0;
  const V = () => $('#view');

  async function open() {
    const r = await api('/api/tests');
    if (r.offline) { V().innerHTML = offlineMsg; return; }
    const s = r.stats;
    V().innerHTML = `
      <section class="hero"><small>Level ${s.level}</small><h2>${s.xp} XP · 🔥 ${s.streak}-day streak</h2></section>
      <section class="card"><h3>Exams</h3>${r.exams.map(e => `
        <div class="ph"><div><b>${e.label}</b><i>${e.note}</i></div>
        <button class="mini" ${e.unlocked ? `data-start="${e.kind}:${e.ref}"` : 'disabled'}>${e.unlocked ? 'Start' : '🔒'}</button></div>`).join('')}
      </section>
      <p class="empty">Every day ends with a quiz: today's words, a review of earlier ones (your weakest first) and up to 3 bonus words from coming lessons.<br>+10 XP per correct answer, +5 per bonus word, +20 for completing a day (pass its quiz at 70%), +50 for your first exam pass.</p>`;
  }

  async function start(kind, ref) {
    const q = await api(`/api/quiz/${kind}/${ref}`);
    if (q.offline) { V().innerHTML = offlineMsg; return; }
    if (!q.questions) return;
    meta = q; Q = q.questions; i = 0; score = 0; bonusOk = 0; results = []; show();
  }

  function show() {
    if (i >= Q.length) return finish();
    const q = Q[i]; locked = false; picked = []; bank = q.tiles ? q.tiles.map((t, k) => k) : [];
    const head = `<small>${meta.kind === 'day' ? 'Day ' + meta.ref + ' quiz' : 'Exam'} · ${i + 1}/${Q.length}</small>${q.bonus ? '<div><span class="tag">Bonus · new word</span></div>' : ''}`;
    let body;
    if (q.type === 'build') {
      body = `<div class="qp">Build in Russian:<br><b>${q.prompt}</b></div><div class="tilebox" id="out"></div><div class="tilebox" id="bank"></div>
        <button class="done-btn" id="check">Check</button>`;
    } else {
      const listen = q.speak ? `<button class="play" data-t="${esc(q.speak)}" aria-label="Play">▶</button>` : '';
      body = `<div class="qp">${listen}<b>${q.type === 'listen' ? q.prompt : q.prompt}</b></div>
        ${q.options.map((o, k) => `<button class="opt" data-o="${k}">${o}</button>`).join('')}`;
    }
    V().innerHTML = `<section class="card fc">${head}${body}<div id="fb"></div></section>`;
    if (q.type === 'build') drawTiles();
    if (q.speak && q.type !== 'en2ru') say(q.speak);
  }

  function drawTiles() {
    const q = Q[i];
    $('#out').innerHTML = picked.map(k => `<button class="tile" data-un="${k}">${q.tiles[k]}</button>`).join('') || '<i class="tr">Tap the words in order</i>';
    $('#bank').innerHTML = bank.filter(k => !picked.includes(k)).map(k => `<button class="tile" data-tile="${k}">${q.tiles[k]}</button>`).join('');
  }

  function feedback(ok, right) {
    locked = true; const q0 = Q[i]; results.push({ ru: q0.ru, ok });
    if (q0.bonus) { if (ok) bonusOk++; } else if (ok) score++;
    $('#fb').innerHTML = `<div class="ans ${ok ? 'okt' : 'badt'}">${ok ? '✓ Correct' : '✗ ' + right}${q0.bonus ? ' · new word from Day ' + q0.day : ''}</div>
      <button class="done-btn" id="nx">${i + 1 < Q.length ? 'Next' : 'Finish'}</button>`;
  }

  async function finish() {
    const core = Q.filter(x => !x.bonus).length, nb = Q.length - core;
    const r = await api('/api/attempt', { kind: meta.kind, ref: meta.ref, correct: score, total: core, bonus: bonusOk, results });
    if (r.offline) { V().innerHTML = offlineMsg; return; }
    V().innerHTML = `<section class="hero"><small>${r.passed ? 'Passed' : 'Not yet'}</small><h2>${score} / ${core} · ${r.pct}%</h2></section>
      <section class="card fc"><div class="big">+${r.xp} XP</div>
      <div class="ans">${nb ? 'Bonus words: ' + bonusOk + '/' + nb + '<br>' : ''}${r.completed ? 'Day ' + meta.ref + ' completed ✓<br>' : ''}Level ${r.stats.level} · ${r.stats.xp} XP · 🔥 ${r.stats.streak}-day streak<br>Pass mark: ${Math.round(meta.need * 100)}%</div>
      <div class="grades"><button data-retry="1">Retry</button><button data-back="1">All tests</button>${meta.kind === 'day' && r.passed && meta.ref < D.length ? '<button class="good" data-nextday="1">Next day →</button>' : ''}</div></section>`;
    if (r.completed) { done.add(meta.ref); updateProgress(); }
    if (typeof refreshDue === 'function') refreshDue();
  }

  V().addEventListener('click', e => {
    if (mode !== 'tests') return;
    const t = e.target.closest('[data-t]'); if (t) return say(t.dataset.t);
    const s = e.target.closest('[data-start]'); if (s) { const [k, r] = s.dataset.start.split(':'); return start(k, +r); }
    if (e.target.closest('[data-back]')) return open();
    if (e.target.closest('[data-nextday]')) { const nd = meta.ref; return setMode('plan').then(() => go(nd)); }
    if (e.target.closest('[data-retry]')) return start(meta.kind, meta.ref);
    if (e.target.closest('#nx')) { i++; return show(); }
    const q = Q[i]; if (!q || locked) return;
    const o = e.target.closest('[data-o]');
    if (o) {
      const k = +o.dataset.o, ok = k === q.answer;
      o.classList.add(ok ? 'ok' : 'bad');
      document.querySelectorAll('.opt')[q.answer].classList.add('ok');
      return feedback(ok, q.options[q.answer]);
    }
    const tl = e.target.closest('[data-tile]'); if (tl) { picked.push(+tl.dataset.tile); return drawTiles(); }
    const un = e.target.closest('[data-un]'); if (un) { picked = picked.filter(k => k !== +un.dataset.un); return drawTiles(); }
    if (e.target.closest('#check')) {
      const ok = picked.length === q.tiles.length && picked.every((k, n) => q.tiles[k] === q.answer[n]);
      say(q.speak); return feedback(ok, q.answer.join(' '));
    }
  });
  return { open, start };
})();
