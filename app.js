'use strict';
var D = window.DATA;

// ---------- helpers ----------
function h(tag, props) {
  var e = document.createElement(tag);
  props = props || {};
  Object.keys(props).forEach(function (k) {
    var v = props[k];
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.indexOf('on') === 0) e[k] = v;
    else if (k === 'value') e.value = v;
    else if (k === 'disabled') { if (v) e.setAttribute('disabled', ''); }
    else e.setAttribute(k, v);
  });
  var kids = Array.prototype.slice.call(arguments, 2);
  (function add(list) {
    list.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) return add(c);
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  })(kids);
  return e;
}
function shuf(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
function norm(s) {
  return String(s).toLowerCase().replace(/[\u2019\u2018]/g, "'").trim().replace(/\s+/g, ' ').replace(/[.,!?;:]+$/, '').trim();
}
function check(input, accepted) {
  var n = norm(input);
  if (!n) return false;
  return accepted.some(function (a) { return norm(a) === n; });
}
function clean(s) { return s.replace(/\(.*?\)/g, '').trim(); }
function speak(t) {
  try {
    if (!window.speechSynthesis || !t) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- storage ----------
var LS = 'englishit_pwa_v1';
var S;
try { S = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { S = null; }
S = S || { xp: 0, streak: 0, lastDay: -1, xpDay: -1, todayXp: 0, stats: {}, best: {}, sess: {}, welcomed: false };
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
function today() { return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); }
if (S.xpDay !== today()) { S.todayXp = 0; S.xpDay = today(); }
function addXp(n) {
  if (S.xpDay !== today()) { S.todayXp = 0; S.xpDay = today(); }
  S.xp += n; S.todayXp += n; save();
}
function touchStreak() {
  var t = today();
  if (S.lastDay === t) return;
  S.streak = (S.lastDay === t - 1) ? S.streak + 1 : 1;
  S.lastDay = t; save();
}
var INTERVALS = [0, 1, 2, 4, 8, 16];
function record(id, ok) {
  var s = S.stats[id] || [0, 0, 0, 0];
  s[0]++; if (!ok) s[1]++;
  s[2] = ok ? Math.min(s[2] + 1, 5) : 0;
  s[3] = today() + INTERVALS[s[2]];
  S.stats[id] = s; save();
}
function attempts(id) { return S.stats[id] ? S.stats[id][0] : 0; }
function wrongsOf(id) { return S.stats[id] ? S.stats[id][1] : 0; }
function isDue(id) { var s = S.stats[id]; return !!s && s[0] > 0 && s[3] <= today(); }

// ---------- content ----------
var BYID = {}, AUTO = {};
function dopts(c, others) {
  return uniq(shuf(uniq(others.filter(function (x) { return x && x !== c; }))).slice(0, 3).concat([c]));
}
function genVocab(v, pool) {
  var out = [], others = pool.filter(function (x) { return x.en !== v.en; });
  var ao = dopts(v.ar, others.map(function (x) { return x.ar; }));
  if (ao.length >= 2) out.push({ id: 'auto:m:' + v.cat + ':' + v.en, t: 'mcq', q: 'ما معنى: ' + v.en, opts: ao, ans: [v.ar], exp: v.en + ' = ' + v.ar });
  if (v.def && v.cat !== 'adj') {
    var dop = dopts(v.def, others.map(function (x) { return x.def; }));
    if (dop.length >= 2) out.push({
      id: 'auto:d:' + v.cat + ':' + v.en, t: 'mcq',
      q: v.cat === 'acronym' ? 'What does ' + v.en + ' stand for?' : 'What is the definition of: ' + v.en + '?',
      opts: dop, ans: [v.def], exp: v.en + ' = ' + v.def + '  (' + v.ar + ')'
    });
    if (v.cat !== 'acronym') {
      var eo = dopts(v.en, others.map(function (x) { return x.en; }));
      if (eo.length >= 2) out.push({
        id: 'auto:w:' + v.cat + ':' + v.en, t: 'mcq',
        q: 'Which word matches this definition?\n"' + v.def + '"', opts: eo, ans: [v.en], exp: v.en + ' = ' + v.ar
      });
    }
  }
  return out;
}
D.units.forEach(function (u) {
  u.lessons.forEach(function (l) {
    l.ex.forEach(function (e, i) {
      e.id = l.id + '-' + (i + 1);
      if (e.t === 'mcq') e.ans = [e.opts[e.a]];
      else if (e.t === 'fill') { e.ans = e.a; e.opts = e.b ? l.boxes[e.b] : []; }
      else if (e.t === 'order') e.ans = [e.a];
      BYID[e.id] = e;
    });
    if (l.auto) {
      var pool = D.vocab.filter(function (v) { return l.auto.cats.indexOf(v.cat) >= 0; });
      var gen = [];
      pool.forEach(function (v) { gen = gen.concat(genVocab(v, pool)); });
      AUTO[l.id] = gen;
      gen.forEach(function (e) { BYID[e.id] = e; });
    }
  });
});
function matchGroup(items) {
  var pick = shuf(items).slice(0, 5);
  if (pick.length < 3) return null;
  var e = {
    id: 'auto:match:' + pick.map(function (p) { return p.en; }).join('|'), t: 'match',
    q: 'Match each word with its meaning',
    pairs: pick.map(function (p) { return [p.en, p.def ? p.def : p.ar]; }), exp: 'راجع التعريفات في تبويب الكلمات'
  };
  BYID[e.id] = e;
  return e;
}
function sessionFor(l) {
  var list = l.ex.slice();
  if (l.auto) {
    list = list.concat(shuf(AUTO[l.id] || []).slice(0, l.auto.n));
    var items = D.vocab.filter(function (v) { return l.auto.cats.indexOf(v.cat) >= 0; });
    for (var i = 0; i < l.auto.match; i++) { var m = matchGroup(items); if (m) list.push(m); }
  }
  return list;
}
function allEx(ids) {
  var out = [];
  D.units.forEach(function (u) {
    if (ids && ids.indexOf(u.id) < 0) return;
    u.lessons.forEach(function (l) {
      out = out.concat(l.ex.filter(function (e) { return e.t !== 'write'; }), AUTO[l.id] || []);
    });
  });
  return out;
}
function unitEx(u) {
  var out = [];
  u.lessons.forEach(function (l) { out = out.concat(l.ex, AUTO[l.id] || []); });
  return out;
}
function answerText(ex) {
  if (ex.t === 'fill') return ex.ans.join(' / ');
  if (ex.t === 'tf') return ex.a ? 'True (صح)' : 'False (خطأ)';
  if (ex.t === 'match') return ex.pairs.map(function (p) { return p[0] + ' = ' + p[1]; }).join('\n');
  if (ex.t === 'write') return ex.model;
  return ex.ans ? ex.ans[0] : '';
}
function spoken(ex) {
  if (ex.t === 'fill') {
    var i = ex.q.indexOf(': ');
    var s = i >= 0 ? ex.q.slice(i + 2) : ex.q;
    return s.replace('___', ex.ans[0]);
  }
  if (ex.t === 'mcq' || ex.t === 'order') return ex.ans[0];
  return '';
}

// ---------- app state ----------
var $app = document.getElementById('app');
var tab = 0, screen = 'home', P = null, FL = null, modal = null;
var examSel = ['u1', 'u2', 'x'], examCnt = 20, wsearch = '';

function render(keepScroll) {
  var y = window.scrollY;
  $app.innerHTML = '';
  if (screen === 'home') $app.append(homeView());
  else if (screen === 'play') $app.append(playView());
  else if (screen === 'flash') $app.append(flashView());
  if (!S.welcomed) $app.append(welcomeView());
  if (modal) $app.append(modal);
  if (keepScroll) window.scrollTo(0, y);
}
function go(s) { screen = s; render(); window.scrollTo(0, 0); }
function openModal(node) {
  modal = h('div', { class: 'overlay', onclick: function (e) { if (e.target === e.currentTarget) closeModal(); } },
    h('div', { class: 'dialog' }, node, h('button', { class: 'btn', onclick: closeModal }, 'إغلاق')));
  render(true);
}
function closeModal() { modal = null; render(true); }
function welcomeView() {
  return h('div', { class: 'overlay' }, h('div', { class: 'dialog' },
    h('h2', {}, '👋 أهلاً بك في English for IT'),
    h('p', {}, 'تطبيق مراجعة أوفلاين لكتاب English for Information Technology 1 والملازم.'),
    h('p', {}, 'تقدّمك في الدروس بيتحفظ تلقائياً.'),
    h('p', { dir: 'ltr', style: 'font-weight:700;font-size:19px;text-align:right' }, 'تطوير: Maggd Alosimi'),
    h('button', { class: 'btn', onclick: function () { S.welcomed = true; save(); render(); } }, 'ابدأ الآن')));
}

// ---------- home ----------
function homeView() {
  var top = h('div', { class: 'top' }, h('span', {}, '🔥 ' + S.streak), h('span', {}, '⭐ ' + S.xp + ' XP'), h('span', {}, '🎯 ' + S.todayXp + '/50'));
  var body = [pathTab, reviewTab, wordsTab, grammarTab][tab]();
  var items = [['🗺️', 'المسار'], ['🔁', 'مراجعة'], ['📚', 'الكلمات'], ['📘', 'القواعد']];
  var nav = h('div', { class: 'nav' }, items.map(function (p, i) {
    return h('button', { class: i === tab ? 'on' : '', onclick: function () { tab = i; render(); window.scrollTo(0, 0); } },
      h('div', {}, p[0]), h('div', { class: 'sm' }, p[1]));
  }));
  return h('div', { class: 'wrap' }, top, h('div', { class: 'content' }, body), nav);
}
function progOf(id) {
  var o = S.sess[id];
  return o ? [o.idx, o.ids.length] : null;
}
function pathTab() {
  var box = h('div', {});
  var off = [0, 40, 70, 40];
  D.units.forEach(function (u) {
    var done = u.lessons.filter(function (l) { return S.best[l.id] !== undefined; }).length;
    box.append(h('div', { class: 'card' }, h('b', { dir: 'auto' }, u.titleAr), h('div', { class: 'sm', dir: 'ltr' }, u.title),
      h('div', { class: 'sm' }, 'المكتمل: ' + done + ' / ' + u.lessons.length)));
    u.lessons.forEach(function (l, i) {
      var best = S.best[l.id], prog = progOf(l.id);
      var col = '#1cb0f6', label = (l.id.match(/l(\d+)$/) || [0, '•'])[1];
      if (best >= 100) { col = '#ffc800'; label = '⭐'; }
      else if (best !== undefined) { col = '#58a700'; label = '✓'; }
      else if (prog) { col = '#ff9600'; label = '▶'; }
      var node = h('div', { class: 'node', style: 'margin-inline-start:' + off[i % 4] + 'px' },
        h('button', { class: 'circle', style: 'background:' + col, onclick: function () { startPlay(l.title, sessionFor(l), l.text || '', l.id, false); } }, label),
        h('b', { style: 'font-size:14px' }, l.titleAr),
        h('div', { class: 'sm', dir: 'ltr' }, l.title));
      if (prog) {
        node.append(h('div', { class: 'sm', style: 'color:#ff9600' }, 'متابعة: ' + prog[0] + ' / ' + prog[1]));
        node.append(h('button', {
          class: 'sm', style: 'border:0;background:none;color:var(--pri)', onclick: function () {
            delete S.sess[l.id]; save(); startPlay(l.title, sessionFor(l), l.text || '', l.id, false);
          }
        }, '↺ إعادة من البداية'));
      }
      box.append(node);
    });
  });
  return box;
}

// ---------- review ----------
function reviewTab() {
  var all = allEx();
  var due = all.filter(function (e) { return isDue(e.id); });
  var weak = all.filter(function (e) { return wrongsOf(e.id) > 0; }).sort(function (a, b) {
    var ra = wrongsOf(a.id) / attempts(a.id), rb = wrongsOf(b.id) / attempts(b.id);
    return rb - ra || wrongsOf(b.id) - wrongsOf(a.id);
  });
  var box = h('div', {});
  box.append(h('div', { class: 'card' }, h('b', {}, '📅 مراجعة اليوم'), h('div', {}, 'عناصر مستحقة للمراجعة الآن: ' + due.length),
    h('button', { class: 'btn', disabled: !due.length, onclick: function () { startPlay('Review', shuf(due).slice(0, 20), '', null, false); } }, 'ابدأ المراجعة')));
  var wl = weak.slice(0, 5).map(function (e) { return h('div', { class: 'sm', dir: 'auto' }, '• ' + e.q.slice(0, 70) + '  (أخطاء: ' + wrongsOf(e.id) + ')'); });
  box.append(h('div', { class: 'card' }, h('b', {}, '❌ الأخطاء والنقاط الضعيفة (' + weak.length + ')'), wl,
    h('button', { class: 'btn', disabled: !weak.length, onclick: function () { startPlay('Mistakes', shuf(weak.slice(0, 20)), '', null, false); } }, 'تدرّب على أخطائي')));
  box.append(h('div', { class: 'card' }, h('b', {}, '⚡ خطة الحفظ لبكرة (حوالي 30 دقيقة)'),
    h('div', { class: 'sm' }, '40 سؤال: أضعف عناصرك أولاً ثم المستحق ثم الجديد من كل الوحدات.'),
    h('button', {
      class: 'btn', onclick: function () {
        var unseen = shuf(all.filter(function (e) { return attempts(e.id) === 0; }));
        var seen = {}, plan = [];
        weak.slice(0, 25).concat(shuf(due), unseen).forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; plan.push(e); } });
        startPlay('Cram', plan.slice(0, 40), '', null, false);
      }
    }, 'ابدأ الخطة')));
  var chips = [['u1', 'وحدة 1'], ['u2', 'وحدة 2'], ['x', 'الملازم']].map(function (p) {
    return h('button', {
      class: 'chip' + (examSel.indexOf(p[0]) >= 0 ? ' on' : ''), onclick: function () {
        var i = examSel.indexOf(p[0]); if (i >= 0) examSel.splice(i, 1); else examSel.push(p[0]); render(true);
      }
    }, p[1]);
  });
  var cnts = [10, 20, 30, 40].map(function (n) {
    return h('button', { class: 'chip' + (examCnt === n ? ' on' : ''), onclick: function () { examCnt = n; render(true); } }, String(n));
  });
  box.append(h('div', { class: 'card' }, h('b', {}, '📝 وضع الامتحان (بدون تلميحات)'), h('div', {}, chips), h('div', {}, cnts),
    h('button', { class: 'btn', disabled: !examSel.length, onclick: function () { startPlay('Exam', shuf(allEx(examSel)).slice(0, examCnt), '', null, true); } }, 'ابدأ الامتحان')));
  var acc = D.units.map(function (u) {
    var a = 0, w = 0;
    unitEx(u).forEach(function (e) { a += attempts(e.id); w += wrongsOf(e.id); });
    return h('div', { dir: 'auto' }, u.titleAr + ':  ' + (a ? Math.floor((a - w) * 100 / a) + '%' : '—'));
  });
  box.append(h('div', { class: 'card' }, h('b', {}, '📊 الدقة حسب الوحدة'), acc));
  box.append(h('div', { class: 'sm center', dir: 'ltr' }, 'تطوير: Maggd Alosimi'));
  return box;
}

// ---------- words & grammar ----------
function grammarBody(g) {
  var box = h('div', {}, h('h3', { dir: 'ltr', style: 'margin:0' }, g.title), h('b', {}, g.titleAr),
    h('p', { class: 'pre' }, g.notesAr), h('b', {}, 'القواعد / Rules'));
  var rules = h('div', { class: 'rules' });
  g.rules.concat(g.examples).forEach(function (r) {
    rules.append(h('div', { class: 'vrow' }, h('span', { dir: 'ltr', style: 'flex:1' }, '• ' + r), h('button', { class: 'sp', onclick: function () { speak(r); } }, '🔊')));
  });
  box.append(rules);
  return box;
}
function grammarTab() {
  var box = h('div', {});
  D.grammar.forEach(function (g) { box.append(h('div', { class: 'card' }, grammarBody(g))); });
  return box;
}
function wordsTab() {
  var box = h('div', {});
  var inp = h('input', { class: 'inp', placeholder: 'ابحث عن كلمة أو اختصار أو قاعدة', value: wsearch, dir: 'auto' });
  var fb = h('button', { class: 'btn' });
  var list = h('div', {});
  function upd() {
    var q = wsearch.trim().toLowerCase();
    var res = D.vocab.filter(function (v) {
      return !q || v.en.toLowerCase().indexOf(q) >= 0 || v.ar.indexOf(wsearch.trim()) >= 0 || (v.def || '').toLowerCase().indexOf(q) >= 0;
    });
    var gr = q ? D.grammar.filter(function (g) {
      return g.title.toLowerCase().indexOf(q) >= 0 || g.titleAr.indexOf(wsearch.trim()) >= 0 || g.rules.some(function (r) { return r.toLowerCase().indexOf(q) >= 0; });
    }) : [];
    fb.textContent = '🃏 بطاقات تعليمية (' + res.length + ')';
    fb.onclick = function () { if (res.length) { FL = { q: shuf(res), known: 0, flip: false }; go('flash'); } };
    list.innerHTML = '';
    gr.forEach(function (g) {
      list.append(h('div', { class: 'card', onclick: function () { openModal(grammarBody(g)); } }, h('b', { dir: 'ltr' }, '📘 ' + g.title), h('div', { dir: 'auto' }, g.titleAr)));
    });
    res.forEach(function (v) {
      list.append(h('div', { class: 'card vrow' }, h('div', { style: 'flex:1' }, h('b', { dir: 'ltr' }, v.en), h('div', { dir: 'auto' }, v.ar),
        v.def && h('div', { class: 'sm', dir: 'ltr' }, v.def)), h('button', { class: 'sp', onclick: function () { speak(clean(v.en)); } }, '🔊')));
    });
  }
  inp.oninput = function () { wsearch = inp.value; upd(); };
  box.append(inp, fb, list);
  upd();
  return box;
}
function flashView() {
  var wrap = h('div', { class: 'wrap pbody' });
  wrap.append(h('div', { class: 'vrow' }, h('button', { class: 'x', onclick: function () { go('home'); } }, '✕'),
    h('span', {}, 'متبقي: ' + FL.q.length + '   |   عرفتها: ' + FL.known)));
  if (!FL.q.length) {
    wrap.append(h('div', { class: 'flash' }, h('div', { style: 'font-size:64px' }, '🎉'), h('b', {}, 'خلصت كل البطاقات!'),
      h('button', { class: 'btn', onclick: function () { go('home'); } }, 'رجوع')));
    return wrap;
  }
  var v = FL.q[0];
  var card;
  if (!FL.flip) {
    card = h('div', { class: 'card flash', onclick: function () { FL.flip = true; render(); } },
      h('div', { dir: 'ltr', style: 'font-size:28px;font-weight:700' }, v.en),
      h('button', { class: 'sp', style: 'font-size:32px', onclick: function (e) { e.stopPropagation(); speak(clean(v.en)); } }, '🔊'),
      h('div', { class: 'sm' }, 'اضغط لقلب البطاقة'));
  } else {
    card = h('div', { class: 'card flash', onclick: function () { FL.flip = false; render(); } },
      h('div', { dir: 'auto', style: 'font-size:24px;font-weight:700' }, v.ar), v.def && h('div', { dir: 'ltr' }, v.def));
  }
  wrap.append(card);
  wrap.append(h('div', { class: 'vrow' },
    h('button', { class: 'btn2', style: 'flex:1;padding:14px', onclick: function () { FL.q.push(FL.q.shift()); FL.flip = false; render(); } }, 'لم أعرفها ❌'),
    h('button', { class: 'btn', style: 'flex:1;margin:0', onclick: function () { FL.q.shift(); FL.known++; FL.flip = false; render(); } }, 'عرفتها ✅')));
  return wrap;
}

// ---------- session ----------
function resetCur() {
  var ex = P.list[P.idx];
  if (!ex) { P.cur = null; return; }
  var c = { sel: null, text: '', shown: false, chosen: [], done: [], mistakes: 0, selL: null };
  if (ex.t === 'mcq') c.opts = shuf(ex.opts);
  if (ex.t === 'fill') c.chips = shuf(ex.opts || []);
  if (ex.t === 'order') c.words = shuf(ex.ans[0].split(' ').filter(Boolean).concat(ex.extra || []));
  if (ex.t === 'match') c.right = shuf(ex.pairs.map(function (p) { return p[1]; }));
  P.cur = c;
}
function startPlay(title, list, text, lid, exam) {
  P = { title: title, orig: list.slice(), list: list.slice(), text: text, lid: lid, exam: exam, idx: 0, hearts: 5, correct: 0, total: 0, fb: null, retried: {}, wrongs: [], rewarded: false, cur: null };
  if (lid && !exam && S.sess[lid]) {
    var o = S.sess[lid];
    var l2 = o.ids.map(function (id) { return BYID[id]; }).filter(Boolean);
    if (l2.length) {
      P.list = l2; P.idx = Math.min(o.idx, l2.length); P.hearts = o.hearts; P.correct = o.correct; P.total = o.total;
      (o.retried || []).forEach(function (id) { P.retried[id] = 1; });
    }
  }
  resetCur();
  go('play');
}
function persist() {
  if (!P || !P.lid || P.exam) return;
  var fin = P.idx >= P.list.length, dead = P.hearts <= 0 && P.fb === null;
  if (fin || dead) delete S.sess[P.lid];
  else if (P.total > 0 || P.idx > 0) {
    S.sess[P.lid] = { ids: P.list.map(function (e) { return e.id; }), idx: P.idx + (P.fb !== null ? 1 : 0), hearts: P.hearts, correct: P.correct, total: P.total, retried: Object.keys(P.retried) };
  }
  save();
}
function exitPlay() { persist(); P = null; go('home'); }
function submit(ok) {
  var ex = P.list[P.idx];
  P.total++;
  if (ok) { P.correct++; addXp(10); }
  else {
    P.wrongs.push(ex);
    if (!P.exam) {
      P.hearts--;
      if (!P.retried[ex.id] && ex.t !== 'write') { P.retried[ex.id] = 1; P.list.push(ex); }
    }
  }
  record(ex.id, ok);
  touchStreak();
  if (P.exam) { P.idx++; resetCur(); } else P.fb = ok;
  persist();
  render(true);
  if (P.exam) window.scrollTo(0, 0);
}
function cont() { P.fb = null; P.idx++; resetCur(); persist(); render(); window.scrollTo(0, 0); }

function playView() {
  var fin = P.idx >= P.list.length;
  var dead = !P.exam && P.hearts <= 0 && P.fb === null;
  if (dead) return endView('💔', 'خلصت القلوب!', 'جرّب الدرس مرة تانية — القلوب بترجع 5.', []);
  if (fin) {
    var pct = P.total ? Math.floor(P.correct * 100 / P.total) : 0;
    if (!P.rewarded) {
      P.rewarded = true; addXp(20); touchStreak();
      if (P.lid && !(S.best[P.lid] >= pct)) S.best[P.lid] = pct;
      persist(); save();
    }
    var seen = {}, wl = [];
    P.wrongs.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; wl.push(e); } });
    return endView(pct >= 80 ? '🎉' : '💪', 'النتيجة: ' + P.correct + ' / ' + P.total + '  (' + pct + '%)', '+' + (P.correct * 10 + 20) + ' XP', wl);
  }
  var ex = P.list[P.idx];
  var top = h('div', { class: 'ptop' },
    h('button', { class: 'x', onclick: exitPlay }, '✕'),
    h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:' + (P.idx / P.list.length * 100) + '%' })),
    !P.exam && h('span', {}, '❤️ ' + P.hearts),
    P.text && h('button', { class: 'x', onclick: function () { openModal(h('div', { dir: 'ltr', class: 'txt' }, P.text)); } }, '📖'));
  var inst = { mcq: 'اختر الإجابة الصحيحة', fill: 'أكمل الفراغ', tf: 'صح أم خطأ؟', order: 'رتّب الكلمات لتكوين الجملة', match: 'اربط كل عنصر بما يناسبه', write: 'اكتب إجابتك ثم قارنها بالنموذج' }[ex.t];
  var view = { mcq: viewMcq, fill: viewFill, tf: viewTf, order: viewOrder, match: viewMatch, write: viewWrite }[ex.t](ex);
  var wrap = h('div', { class: 'wrap' }, top, h('div', { class: 'pbody' }, h('div', { class: 'inst' }, inst), view));
  if (P.fb !== null && !P.exam) wrap.append(feedbackView(ex));
  return wrap;
}
function feedbackView(ex) {
  var ok = P.fb;
  var box = h('div', { class: 'fb ' + (ok ? 'okbg' : 'badbg') }, h('b', { style: 'font-size:19px' }, ok ? '✅ صحيح!' : '❌ إجابة غير صحيحة'));
  if (!ok && ex.t !== 'write') box.append(h('div', { class: 'sm' }, 'الإجابة الصحيحة:'), h('div', { dir: 'auto', class: 'ans' }, answerText(ex)));
  if (ex.exp) box.append(h('div', { dir: 'auto' }, ex.exp));
  var row = h('div', { class: 'row' });
  if (ex.g) row.append(h('button', { class: 'btn2', onclick: function () { var g = D.grammar.filter(function (x) { return x.id === ex.g; })[0]; if (g) openModal(grammarBody(g)); } }, 'لماذا؟'));
  var sp = spoken(ex);
  if (sp) row.append(h('button', { class: 'btn2', onclick: function () { speak(sp); } }, '🔊'));
  row.append(h('button', { class: 'btn', onclick: cont }, 'متابعة'));
  box.append(row);
  return box;
}
function endView(emoji, title, sub, wrongs) {
  var box = h('div', { class: 'pbody center' }, h('div', { style: 'font-size:64px;margin-top:30px' }, emoji), h('h2', { dir: 'auto' }, title), h('div', {}, sub),
    h('button', { class: 'btn', onclick: function () { P = null; go('home'); } }, 'تم'),
    h('button', {
      class: 'btn2', style: 'width:100%', onclick: function () {
        if (P.lid) { delete S.sess[P.lid]; save(); }
        var p = P; startPlay(p.title, p.orig, p.text, p.lid, p.exam);
      }
    }, 'إعادة'));
  if (wrongs.length) {
    box.append(h('h3', { style: 'text-align:right' }, 'الأسئلة الخاطئة والإجابات الصحيحة:'));
    wrongs.forEach(function (w) {
      box.append(h('div', { class: 'card', style: 'text-align:right' }, h('div', { dir: 'auto', class: 'pre' }, w.q),
        w.t !== 'write' && h('div', { class: 'ans', dir: 'auto' }, '✔ ' + answerText(w)), w.exp && h('div', { class: 'sm', dir: 'auto' }, w.exp)));
    });
  }
  return h('div', { class: 'wrap' }, box);
}

// ---------- exercise views ----------
function viewMcq(ex) {
  var c = P.cur, locked = P.fb !== null, right = ex.ans[0];
  var box = h('div', {}, h('div', { class: 'q', dir: 'auto' }, ex.q));
  c.opts.forEach(function (o) {
    var cls = 'opt';
    if (locked && o === right) cls += ' ok'; else if (locked && o === c.sel) cls += ' bad'; else if (o === c.sel) cls += ' sel';
    box.append(h('div', { class: cls, dir: 'auto', onclick: function () { if (!locked) { c.sel = o; render(true); } } }, o));
  });
  box.append(h('button', { class: 'btn', disabled: c.sel === null || locked, onclick: function () { submit(c.sel === right); } }, 'تحقق'));
  return box;
}
function viewFill(ex) {
  var c = P.cur, locked = P.fb !== null;
  function go2() { if (c.text.trim() && !locked) submit(check(c.text, ex.ans)); }
  var inp = h('input', { class: 'inp', dir: 'ltr', value: c.text, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', disabled: locked });
  inp.oninput = function () { c.text = inp.value; btn.disabled = !c.text.trim(); };
  inp.onkeydown = function (e) { if (e.key === 'Enter') go2(); };
  var btn = h('button', { class: 'btn', disabled: locked || !c.text.trim(), onclick: go2 }, 'تحقق');
  var box = h('div', {}, h('div', { class: 'q', dir: 'auto' }, ex.q), inp);
  if (c.chips.length) {
    box.append(h('div', { class: 'ltr' }, c.chips.map(function (w) {
      return h('button', { class: 'w', disabled: locked, onclick: function () { c.text = w; render(true); } }, w);
    })));
  }
  box.append(btn);
  return box;
}
function viewTf(ex) {
  var c = P.cur, locked = P.fb !== null;
  var box = h('div', {}, h('div', { class: 'q', dir: 'auto' }, ex.q));
  [[true, '✓  True  (صح)'], [false, '✗  False  (خطأ)']].forEach(function (p) {
    var cls = 'opt';
    if (locked && p[0] === ex.a) cls += ' ok'; else if (locked && c.sel === p[0]) cls += ' bad';
    box.append(h('div', { class: cls, onclick: function () { if (!locked) { c.sel = p[0]; submit(p[0] === ex.a); } } }, p[1]));
  });
  return box;
}
function viewOrder(ex) {
  var c = P.cur, locked = P.fb !== null;
  var drop = h('div', { class: 'dropzone' }, c.chosen.map(function (i) {
    return h('button', { class: 'w used', disabled: locked, onclick: function () { c.chosen.splice(c.chosen.indexOf(i), 1); render(true); } }, c.words[i]);
  }));
  var bank = h('div', { class: 'ltr' }, c.words.map(function (w, i) {
    return h('button', { class: 'w', disabled: locked || c.chosen.indexOf(i) >= 0, onclick: function () { c.chosen.push(i); render(true); } }, w);
  }));
  return h('div', {}, h('div', { class: 'q', dir: 'auto' }, ex.q), drop, bank,
    h('button', {
      class: 'btn', disabled: !c.chosen.length || locked, onclick: function () {
        submit(check(c.chosen.map(function (i) { return c.words[i]; }).join(' '), ex.ans));
      }
    }, 'تحقق'));
}
function viewMatch(ex) {
  var c = P.cur, locked = P.fb !== null;
  var doneR = c.done.map(function (l) { return ex.pairs.filter(function (p) { return p[0] === l; })[0][1]; });
  var left = h('div', {}), right = h('div', {});
  ex.pairs.forEach(function (p) {
    var l = p[0], isDone = c.done.indexOf(l) >= 0;
    var cls = 'opt' + (isDone ? ' ok' : (c.selL === l ? ' sel' : ''));
    left.append(h('div', { class: cls, dir: 'auto', onclick: function () { if (!isDone && !locked) { c.selL = l; render(true); } } }, l));
  });
  c.right.forEach(function (r) {
    var isDone = doneR.indexOf(r) >= 0;
    right.append(h('div', { class: 'opt' + (isDone ? ' ok' : ''), dir: 'auto', onclick: function () {
      if (isDone || locked || c.selL === null) return;
      var sl = c.selL;
      var correct = ex.pairs.filter(function (p) { return p[0] === sl; })[0][1] === r;
      if (correct) {
        c.done.push(sl); c.selL = null;
        if (c.done.length === ex.pairs.length) { submit(c.mistakes === 0); return; }
      } else { c.mistakes++; c.selL = null; }
      render(true);
    } }, r));
  });
  return h('div', {}, h('div', { class: 'q', dir: 'auto' }, ex.q), h('div', { class: 'mrow' }, left, right),
    c.mistakes ? h('div', { class: 'sm' }, 'محاولات خاطئة: ' + c.mistakes) : null);
}
function viewWrite(ex) {
  var c = P.cur, locked = P.fb !== null;
  var ta = h('textarea', { class: 'inp', rows: '4', dir: 'ltr', disabled: locked }, c.text);
  ta.oninput = function () { c.text = ta.value; };
  var box = h('div', {}, h('div', { class: 'q', dir: 'auto' }, ex.q), ta);
  if (!c.shown) box.append(h('button', { class: 'btn', onclick: function () { c.shown = true; render(true); } }, 'أظهر النموذج'));
  else {
    box.append(h('div', { class: 'card' }, h('b', {}, 'نموذج الإجابة:'), h('div', { dir: 'ltr' }, ex.model)),
      h('div', { class: 'vrow' },
        h('button', { class: 'btn', style: 'margin:0;flex:1', disabled: locked, onclick: function () { submit(true); } }, '✅ كتبتها صح'),
        h('button', { class: 'btn2', style: 'flex:1;padding:14px', disabled: locked, onclick: function () { submit(false); } }, '❌ أحتاج مراجعة')));
  }
  return box;
}

render();
