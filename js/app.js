const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/"/g, '&quot;');
const api = (url, body) => Backend.handle(url, body);

let D = [], done = new Set(), cur = 0, mode = 'plan', voices = [];
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem('prefs') || '{}'); } catch (e) {}
const savePrefs = () => { try { localStorage.setItem('prefs', JSON.stringify(prefs)); } catch (e) {} };
cur = prefs.cur || 0;

/* ---------- speech (browser voices) ---------- */
function loadVoices() {
  voices = (speechSynthesis.getVoices() || []).filter(v => /^ru/i.test(v.lang));
  const s = $('#voice'); s.innerHTML = '';
  voices.forEach((v, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = v.name; s.appendChild(o);
  });
  const k = voices.findIndex(v => v.name === prefs.voice); if (k >= 0) s.value = k;
  $('#warn').style.display = voices.length ? 'none' : 'block';
}
function utter(t) {
  const u = new SpeechSynthesisUtterance(t); u.lang = 'ru-RU';
  const v = voices[$('#voice').value]; if (v) u.voice = v;
  u.rate = parseFloat($('#rate').value); return u;
}
function say(t) {
  if (!('speechSynthesis' in window)) { $('#set').classList.add('on'); $('#warn').style.display = 'block'; return; }
  speechSynthesis.cancel(); speechSynthesis.speak(utter(t));
}
function sayAll(list) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); list.forEach(t => speechSynthesis.speak(utter(t)));
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
else $('#warn').style.display = 'block';
$('#voice').onchange = e => { const v = voices[e.target.value]; if (v) { prefs.voice = v.name; savePrefs(); } };
$('#rate').onchange = e => { prefs.rate = e.target.value; savePrefs(); };
if (prefs.rate) $('#rate').value = prefs.rate;
$('#gear').onclick = () => $('#set').classList.toggle('on');

/* ---------- plan mode ---------- */
function updateProgress() {
  $('#bar').style.width = (done.size / D.length * 100) + '%';
  $('#pt').textContent = done.size + ' / ' + D.length + ' days';
}
function renderPlan() {
  const d = D[cur], wk = Math.floor(cur / 7), nw = Math.ceil(D.length / 7);
  $('#weeks').innerHTML = Array.from({ length: nw }, (_, i) =>
    `<button data-w="${i}" class="${i === wk ? 'on' : ''}">W${i + 1}</button>`).join('');
  const a = wk * 7, b = Math.min(D.length, a + 7);
  $('#days').style.gridTemplateColumns = 'repeat(7,1fr)';
  $('#days').innerHTML = Array.from({ length: b - a }, (_, j) => {
    const i = a + j;
    return `<button data-d="${i}" class="${i === cur ? 'on' : ''} ${done.has(i + 1) ? 'done' : ''} ${D[i].rest ? 'rest' : ''}">${done.has(i + 1) ? '✓' : i + 1}</button>`;
  }).join('');
  const vocab = d.vocab.map(v =>
    `<button class="v" data-t="${esc(v.ru)}"><b>${v.ru}</b><span>${v.tr}</span><i>${v.en}</i></button>`).join('');
  const ph = d.phrases.map(p =>
    `<div class="ph"><button class="play" data-t="${esc(p.ru)}" aria-label="Play">▶</button><div><b>${p.ru}</b><i>${p.en}</i></div></div>`).join('');
  $('#view').innerHTML = `
    <section class="hero"><small>${d.stage} · Day ${d.day}</small><h2>${d.title}</h2></section>
    <section class="card"><h3><span><span class="tag">A</span>Words · 30 min</span><button class="mini" data-all="1">▶ Play all</button></h3><div class="vg">${vocab}</div></section>
    <section class="card"><h3><span><span class="tag">B</span>Lesson · 40 min</span></h3><div class="note">${d.lesson}</div></section>
    <section class="card"><h3><span><span class="tag">C</span>Speak · 20 min</span></h3><div class="note" style="margin-bottom:6px">${d.task}</div>${ph}</section>
    <button class="done-btn ${done.has(d.day) ? 'on' : ''}" data-quiz="1">${done.has(d.day) ? '✓ Completed · retake the quiz' : 'Finish with the day quiz'}</button>
    <button class="mini" id="done" style="display:block;margin:10px auto 0">${done.has(d.day) ? 'Unmark day' : 'Skip quiz and mark complete'}</button>`;
  $('#prev').disabled = cur === 0; $('#next').disabled = cur === D.length - 1;
  prefs.cur = cur; savePrefs(); updateProgress();
}
function go(i) { cur = Math.max(0, Math.min(D.length - 1, i)); renderPlan(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

$('#weeks').onclick = e => { const b = e.target.closest('button'); if (b) go(+b.dataset.w * 7); };
$('#days').onclick = e => { const b = e.target.closest('button'); if (b) go(+b.dataset.d); };
$('#prev').onclick = () => go(cur - 1);
$('#next').onclick = () => go(cur + 1);
$('#view').onclick = async e => {
  if (mode !== 'plan') return;
  if (e.target.closest('[data-quiz]')) { setMode('tests').then(() => Tests.start('day', D[cur].day)); return; }
  const t = e.target.closest('[data-t]'); if (t) { say(t.dataset.t); return; }
  if (e.target.closest('[data-all]')) { sayAll(D[cur].vocab.map(v => v.ru)); return; }
  if (e.target.closest('#done')) {
    const day = D[cur].day, now = !done.has(day);
    await api('/api/progress/' + day, { done: now });
    now ? done.add(day) : done.delete(day);
    renderPlan(); refreshDue();
  }
};

/* ---------- review mode ---------- */
let queue = [], shown = false;
async function refreshDue() {
  const r = await api('/api/review');
  $('#due').textContent = r.length ? '(' + r.length + ')' : '';
  return r;
}
function showCard() {
  if (!queue.length) {
    $('#view').innerHTML = `<div class="card empty">Nothing due right now.<br>Complete days in the Plan tab to unlock review cards.</div>`;
    return;
  }
  const c = queue[0];
  $('#view').innerHTML = `<section class="card fc">
    <small>${queue.length} left · Day ${c.day}</small>
    <div class="big">${c.ru}</div>
    <button class="mini" data-t="${esc(c.ru)}">▶ Listen</button>
    <div class="ans" id="ans">${shown ? `${c.tr}<br><b>${c.en}</b>` : ''}</div>
    ${shown
      ? `<div class="grades"><button class="again" data-g="again">Again</button><button class="good" data-g="good">Good</button><button class="easy" data-g="easy">Easy</button></div>`
      : `<button class="done-btn" id="show">Show answer</button>`}
  </section>`;
  if (!shown) say(c.ru);
}
$('#view').addEventListener('click', async e => {
  if (mode !== 'review') return;
  const t = e.target.closest('[data-t]'); if (t) { say(t.dataset.t); return; }
  if (e.target.closest('#show')) { shown = true; showCard(); return; }
  const g = e.target.closest('[data-g]');
  if (g && queue.length) {
    const c = queue.shift();
    await api('/api/review/' + c.id, { grade: g.dataset.g });
    shown = false; showCard(); refreshDue();
  }
});

/* ---------- mode switch ---------- */
async function setMode(m) {
  mode = m;
  $('#m-plan').classList.toggle('on', m === 'plan');
  $('#m-rev').classList.toggle('on', m === 'review');
  $('#m-tests').classList.toggle('on', m === 'tests');
  $('#m-basics').classList.toggle('on', m === 'basics');
  $('#planbar').style.display = $('#nav').style.display = m === 'plan' ? '' : 'none';
  if (m === 'plan') renderPlan();
  else if (m === 'tests') await Tests.open();
  else if (m === 'basics') await Basics.open();
  else { queue = await refreshDue(); shown = false; showCard(); }
}
$('#m-plan').onclick = () => setMode('plan');
$('#m-rev').onclick = () => setMode('review');
$('#m-tests').onclick = () => setMode('tests');
$('#m-basics').onclick = () => setMode('basics');

/* ---------- boot ---------- */
(async () => {
  D = await api('/api/days');
  done = new Set((await api('/api/progress')).done);
  cur = Math.min(cur, D.length - 1);
  renderPlan(); refreshDue();
  try {
    const info = await api('/api/info');
    $('#ver').textContent = `Content v${info.version} · ${info.days} days`;
    const prev = localStorage.getItem('ru-content-v');
    let msg = info.error ? '⚠ ' + info.error : (prev && prev !== info.version ? 'Lessons updated · ' + info.days + ' days' : '');
    if (info.error) { $('#set').classList.add('on'); $('#ver').textContent += ' · ' + info.error; }
    if (msg) {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:5.5rem;transform:translateX(-50%);background:#222;color:#fff;padding:.6rem 1rem;border-radius:.6rem;z-index:99;max-width:90%;font-size:.9rem';
      document.body.appendChild(t); setTimeout(() => t.remove(), info.error ? 12000 : 4000);
    }
    localStorage.setItem('ru-content-v', info.version);
  } catch (e) {}
})();

