/* とどけ！こいぶみ：ルールエンジン＋CPU思考（DOMに依存しない。ブラウザでも Node でも動く）
 * カードは「役（role）」のキー文字列で持つ。山札・手札など秘密の情報はホストの S の中だけにあり、
 * 画面へは viewFor(S, p) で「その人が見てよい情報」だけを切り出して渡す。
 * CPU は observe(S, p) で作った「その人が知っている情報」だけを見て考える（山札や他人の手札はのぞかない）。
 */
(function (root) {
'use strict';
var L = {};

// ---------------- モード（公式ルール） ----------------
// ed2     : 第2版（Z-Man/AEG 2019〜）21枚・2〜6人
// classic : 第2版ルールブック付属の「クラシック版」16枚・2〜4人（守備兵1・司書2・うわさ鳥2を抜く）
// kanai   : カナイ製作所／アークライト版（2012/2014）16枚・2〜4人（家令＝合計12以上で脱落）
var MODES = {
  ed2: { key: 'ed2', np: [2, 6], deck: [['spy', 2], ['guard', 6], ['priest', 2], ['baron', 2], ['maid', 2], ['prince', 2], ['chan', 2], ['king', 1], ['countess', 1], ['princess', 1]],
    val: { spy: 0, guard: 1, priest: 2, baron: 3, maid: 4, prince: 5, chan: 6, king: 7, countess: 8, princess: 9 },
    goal: { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 }, protTarget: false, spyBonus: true, bonus8: false, minister: false, countess: true },
  classic: { key: 'classic', np: [2, 4], deck: [['guard', 5], ['priest', 2], ['baron', 2], ['maid', 2], ['prince', 2], ['king', 1], ['countess', 1], ['princess', 1]],
    val: { guard: 1, priest: 2, baron: 3, maid: 4, prince: 5, king: 7, countess: 8, princess: 9 },
    goal: { 2: 6, 3: 5, 4: 4 }, protTarget: false, spyBonus: false, bonus8: false, minister: false, countess: true },
  kanai: { key: 'kanai', np: [2, 4], deck: [['guard', 5], ['priest', 2], ['baron', 2], ['maid', 2], ['prince', 2], ['king', 1], ['minister', 1], ['princess', 1]],
    val: { guard: 1, priest: 2, baron: 3, maid: 4, prince: 5, king: 6, minister: 7, princess: 8 },
    goal: { 2: 3, 3: 3, 4: 3 }, protTarget: true, spyBonus: false, bonus8: true, minister: true, countess: false }
};
Object.keys(MODES).forEach(function (k) {
  var M = MODES[k]; M.roles = M.deck.map(function (d) { return d[0]; }); M.cnt = {}; M.total = 0; M.ri = {};
  M.deck.forEach(function (d, i) { M.cnt[d[0]] = d[1]; M.total += d[1]; M.ri[d[0]] = i; });
  M.vmax = M.val.princess;
});
L.MODES = MODES;
L.MODE_KEYS = ['ed2', 'classic', 'kanai'];
var OTHER = { guard: 1, priest: 1, baron: 1, king: 1 }, ANY = { prince: 1 };
L.needsTarget = function (r) { return OTHER[r] ? 'other' : ANY[r] ? 'any' : null; };

L.mulberry = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
L.shuffle = shuffle;
L.fullDeck = function (mk) { var M = MODES[mk], d = []; M.deck.forEach(function (x) { for (var i = 0; i < x[1]; i++) d.push(x[0]); }); return d; };
function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
function mat(n, v) { var m = []; for (var i = 0; i < n; i++) { var r = []; for (var j = 0; j < n; j++) r.push(v); m.push(r); } return m; }

// ---------------- ゲーム（マッチ） ----------------
L.newMatch = function (o) {
  var M = MODES[o.mode || 'ed2'], n = o.n;
  if (n < M.np[0] || n > M.np[1]) throw new Error('人数がモードに合いません');
  var S = { mode: M.key, n: n, rng: o.rng || Math.random, fast: !!o.fast, tok: zeros(n), goal: M.goal[n], round: 0, phase: 'idle', start: o.start != null ? o.start : Math.floor((o.rng || Math.random)() * n),
    evId: 0, ev: [], results: [], result: null, winners: null, need: null };
  return S;
};
function M_(S) { return MODES[S.mode]; }
function ev(S, e) { if (S.fast) return; e.id = ++S.evId; S.ev.push(e); if (S.ev.length > 400) S.ev.splice(0, S.ev.length - 400); }
L.startRound = function (S) {
  var M = M_(S), n = S.n;
  S.round++; S.phase = 'play'; S.result = null;
  S.deck = shuffle(L.fullDeck(S.mode), S.rng);
  S.aside = S.deck.shift(); S.faceUp = n === 2 ? S.deck.splice(0, 3) : [];
  S.P = []; for (var p = 0; p < n; p++) S.P.push({ hand: [S.deck.shift()], disc: [], out: false, prot: false, spy: false });
  S.pub = {}; M.roles.forEach(function (r) { S.pub[r] = 0; }); S.faceUp.forEach(function (r) { S.pub[r]++; });
  S.kn = mat(n, null); S.pk = mat(n, false);
  if (!S.fast) {
    S.K = []; for (var q = 0; q < n; q++) S.K.push({ L: mat(n, null).map(function () { return M.roles.map(function () { return 1; }); }), kb: [], dk: zeros(n).map(function () { return null; }) });
  }
  S.turn = S.start;
  ev(S, { k: 'round', round: S.round, start: S.start, faceUp: S.faceUp.slice() });
  beginTurn(S, S.start);
};
function alive(S) { var a = []; for (var p = 0; p < S.n; p++) if (!S.P[p].out) a.push(p); return a; }
L.alive = alive;
function drawTop(S, p) {   // 山の上から1枚（山がなければ伏せ札）
  var r;
  if (S.deck.length) {
    if (!S.fast) S.K.forEach(function (K, o) { if (o === p) return; for (var i = 0; i < K.kb.length; i++) if (K.kb[i].pos === S.deck.length - 1) { K.dk[p] = K.kb[i].r; K.kb.splice(i, 1); break; } });
    r = S.deck.shift();
    if (!S.fast) S.K[p].kb = S.K[p].kb.filter(function (b) { return b.pos !== S.deck.length; });   // 自分で戻したカードを自分で引いた
  } else { r = S.aside; S.aside = null; }
  return r;
}
function beginTurn(S, p) {
  var P = S.P[p], M = M_(S);
  S.turn = p; P.prot = false;
  P.hand.push(drawTop(S, p));
  ev(S, { k: 'draw', p: p });
  if (M.minister && P.hand.indexOf('minister') >= 0 && M.val[P.hand[0]] + M.val[P.hand[1]] >= 12) {   // 家令：合計12以上で脱落
    ev(S, { k: 'minister', p: p, cards: P.hand.slice() });
    eliminate(S, p, 'minister');
    return endTurn(S, p);
  }
  S.need = { k: 'play', p: p };
}
function discard(S, p, r) { S.P[p].disc.push(r); S.pub[r]++; if (r === 'spy') S.P[p].spy = true; }
function eliminate(S, p, why) {
  var P = S.P[p], cards = P.hand.slice();
  P.hand.forEach(function (r) { discard(S, p, r); }); P.hand = []; P.out = true; P.prot = false;
  ev(S, { k: 'out', p: p, why: why, cards: cards });
}
// 手番の人の、正しく出せるカード（伯爵令嬢の強制）
L.forcedIdx = function (mode, hand) {
  var M = MODES[mode]; if (!M.countess || hand.length !== 2) return -1;
  var ci = hand.indexOf('countess'); if (ci < 0) return -1;
  var o = hand[1 - ci]; return o === 'king' || o === 'prince' ? ci : -1;
};
// 対象に選べる人。 o = { mode, n, P:[{out,prot}] }。 戻り値 { kind, list, none }
L.targets = function (o, me, r) {
  var M = MODES[o.mode], kind = L.needsTarget(r), list = [];
  if (!kind) return { kind: null, list: [], none: false };
  for (var q = 0; q < o.n; q++) {
    var P = o.P[q]; if (P.out) continue;
    if (q === me) { if (kind === 'any') list.push(q); continue; }
    if (P.prot && !M.protTarget) continue;
    list.push(q);
  }
  return { kind: kind, list: list, none: list.length === 0 };
};
L.guessRoles = function (mode) { return MODES[mode].roles.filter(function (r) { return r !== 'guard'; }); };
L.err = function (S, p, a) {
  var M = M_(S);
  if (S.phase !== 'play' || !S.need || S.need.p !== p) return 'あなたの番ではありません';
  var P = S.P[p];
  if (S.need.k === 'chan') {
    if (a.a !== 'chan') return '残すカードを選んでください';
    if (!(a.keep >= 0 && a.keep < P.hand.length)) return '残すカードを選んでください';
    var rest = P.hand.length - 1, ord = a.order || [];
    if (ord.length !== rest || ord.indexOf(a.keep) >= 0) return '戻す順番が正しくありません';
    for (var i = 0; i < ord.length; i++) if (!(ord[i] >= 0 && ord[i] < P.hand.length) || ord.indexOf(ord[i]) !== i) return '戻す順番が正しくありません';
    return null;
  }
  if (a.a !== 'play') return '出すカードを選んでください';
  if (!(a.i === 0 || a.i === 1) || P.hand.length !== 2) return '出すカードを選んでください';
  var fi = L.forcedIdx(S.mode, P.hand);
  if (fi >= 0 && a.i !== fi) return M.countess ? '令嬢を出さなければなりません（大公・錬金術師と一緒のとき）' : '出せません';
  var r = P.hand[a.i], tg = L.targets(S, p, r);
  if (tg.kind && !tg.none) {
    if (tg.list.indexOf(a.t) < 0) return '対象を選んでください';
    if (r === 'guard' && (L.guessRoles(S.mode).indexOf(a.g) < 0)) return '当てる役を選んでください（門番以外）';
  }
  return null;
};
// ---------------- 行動 ----------------
L.act = function (S, p, a) {
  var e = L.err(S, p, a); if (e) return e;
  if (S.need.k === 'chan') { chanDone(S, p, a); return null; }
  var P = S.P[p], r = P.hand[a.i], keep = P.hand[1 - a.i], tg = L.targets(S, p, r);
  var t = tg.kind && !tg.none ? a.t : -1;
  if (!S.fast) S.K.forEach(function (K, o) { if (o !== p) beliefPlay(S, o, p, r); });
  P.hand.splice(a.i, 1); discard(S, p, r);
  for (var q = 0; q < S.n; q++) { if (S.kn[q][p] === r) S.kn[q][p] = null; S.pk[q][p] = false; }   // 知っていたカードを出された
  var E = { k: 'play', p: p, c: r, t: t };
  var blocked = t >= 0 && t !== p && S.P[t].prot;   // 家令版：僧院の守り（ばあや）を受けている人も選べるが、効果なし
  if (blocked) { E.res = 'blocked'; ev(S, E); return endTurn(S, p); }
  switch (r) {
    case 'guard':
      if (t < 0) { E.res = 'noeff'; ev(S, E); break; }
      E.g = a.g;
      if (S.P[t].hand[0] === a.g) { E.res = 'hit'; ev(S, E); eliminate(S, t, 'guard'); }
      else { E.res = 'miss'; ev(S, E); if (!S.fast) S.K.forEach(function (K, o) { if (o !== t) K.L[t][M_(S).ri[a.g]] = 0; }); }
      break;
    case 'priest':
      if (t < 0) { E.res = 'noeff'; ev(S, E); break; }
      S.kn[p][t] = S.P[t].hand[0]; S.pk[p][t] = true;
      E.res = 'seen'; E.pv = {}; E.pv[p] = { seen: S.P[t].hand[0] }; ev(S, E);
      if (!S.fast) setDelta(S, p, t, S.P[t].hand[0]);
      break;
    case 'baron':
      if (t < 0) { E.res = 'noeff'; ev(S, E); break; }
      var V = M_(S).val, mv = V[keep], tv = V[S.P[t].hand[0]], tc = S.P[t].hand[0];
      E.pv = {}; E.pv[p] = { mine: keep, theirs: tc }; E.pv[t] = { mine: tc, theirs: keep };
      if (mv === tv) {
        E.res = 'tie'; ev(S, E); S.kn[p][t] = tc; S.kn[t][p] = keep; S.pk[p][t] = S.pk[t][p] = true;
        if (!S.fast) { setDelta(S, p, t, tc); setDelta(S, t, p, keep); S.K.forEach(function (K, o) { if (o !== p && o !== t) beliefTie(S, o, p, t); }); }
      } else {
        var loser = mv < tv ? p : t, win = loser === p ? t : p;
        E.res = loser === t ? 'win' : 'lose'; E.lv = Math.min(mv, tv); ev(S, E);
        eliminate(S, loser, 'baron');
        if (!S.fast) S.K.forEach(function (K, o) { if (o !== win) { var Lw = K.L[win], M = M_(S); M.roles.forEach(function (x, i) { if (M.val[x] <= E.lv) Lw[i] = 0; }); } });
      }
      break;
    case 'maid': P.prot = true; ev(S, E); break;
    case 'prince':
      var T = S.P[t], old = T.hand[0];
      E.disc = old; ev(S, E);
      T.hand = []; discard(S, t, old);
      for (var x = 0; x < S.n; x++) { S.kn[x][t] = null; S.pk[x][t] = false; }
      if (old === 'princess') { ev(S, { k: 'out', p: t, why: 'princess', cards: [] }); T.out = true; T.prot = false; break; }
      var fromAside = !S.deck.length, nw = drawTop(S, t);
      T.hand = [nw];
      ev(S, { k: 'redraw', p: t, aside: fromAside, pv: (function () { var o = {}; o[t] = { got: nw }; return o; })() });
      if (!S.fast) S.K.forEach(function (K, o) { if (o !== t) { K.L[t] = M_(S).roles.map(function () { return 1; }); if (K.dk[t] != null) { setDelta(S, o, t, K.dk[t]); K.dk[t] = null; } } });
      break;
    case 'chan':
      var k = Math.min(2, S.deck.length);
      if (!k) { E.res = 'noeff'; ev(S, E); break; }
      var drawn = []; for (var j = 0; j < k; j++) { var d = drawTop(S, p); drawn.push(d); P.hand.push(d); }
      E.n = k; E.pv = {}; E.pv[p] = { drew: drawn }; ev(S, E);
      for (var y = 0; y < S.n; y++) { S.kn[y][p] = null; S.pk[y][p] = false; }
      S.need = { k: 'chan', p: p };
      return null;
    case 'king':
      if (t < 0) { E.res = 'noeff'; ev(S, E); break; }
      var mine = P.hand[0], theirs = S.P[t].hand[0];
      P.hand = [theirs]; S.P[t].hand = [mine];
      E.pv = {}; E.pv[p] = { gave: mine, got: theirs }; E.pv[t] = { gave: theirs, got: mine }; ev(S, E);
      for (var z = 0; z < S.n; z++) { var a1 = S.kn[z][p]; S.kn[z][p] = S.kn[z][t]; S.kn[z][t] = a1; var b1 = S.pk[z][p]; S.pk[z][p] = S.pk[z][t]; S.pk[z][t] = b1; }
      S.kn[p][t] = mine; S.kn[t][p] = theirs; S.kn[p][p] = S.kn[t][t] = null; S.pk[p][t] = S.pk[t][p] = true; S.pk[p][p] = S.pk[t][t] = false;
      if (!S.fast) S.K.forEach(function (K, o) {
        if (o === p) setDelta(S, o, t, mine); else if (o === t) setDelta(S, o, p, theirs);
        else { var tmp = K.L[p]; K.L[p] = K.L[t]; K.L[t] = tmp; }
      });
      break;
    case 'princess': ev(S, E); eliminate(S, p, 'princess'); break;
    default: ev(S, E);   // countess, spy, minister：出しても効果なし
  }
  return endTurn(S, p);
};
function chanDone(S, p, a) {
  var P = S.P[p], keepR = P.hand[a.keep], back = a.order.map(function (i) { return P.hand[i]; });   // order：山の上側 → いちばん下
  P.hand = [keepR];
  if (!S.fast) S.K.forEach(function (K) { K.kb.forEach(function (b) { b.pos += back.length; }); });
  for (var i = 0; i < back.length; i++) S.deck.push(back[i]);
  if (!S.fast) { S.K.forEach(function (K3) { K3.dk[p] = null; }); var K = S.K[p]; back.forEach(function (r, i) { K.kb.push({ r: r, pos: back.length - 1 - i }); }); S.K.forEach(function (K2, o) { if (o !== p) K2.L[p] = M_(S).roles.map(function () { return 1; }); }); }
  var pv = {}; pv[p] = { kept: keepR, back: back };
  ev(S, { k: 'chanDone', p: p, n: back.length, pv: pv });
  endTurn(S, p);
}
function endTurn(S, p) {
  S.need = null;
  var al = alive(S);
  if (al.length <= 1) return roundEnd(S, 'last');
  if (!S.deck.length) return roundEnd(S, 'deck');
  var q = p; do { q = (q + 1) % S.n; } while (S.P[q].out);
  beginTurn(S, q);
  return null;
}
function roundEnd(S, why) {
  var M = M_(S), al = alive(S), win = [], hands = zeros(S.n).map(function () { return null; });
  if (why === 'last') win = al.slice();
  else {
    var best = -1; al.forEach(function (p) { var v = M.val[S.P[p].hand[0]]; hands[p] = S.P[p].hand[0]; if (v > best) { best = v; win = [p]; } else if (v === best) win.push(p); });
  }
  var gain = zeros(S.n);
  win.forEach(function (p) { gain[p] += M.bonus8 && M.val[S.P[p].hand[0]] === 8 ? 2 : 1; });
  var spy = -1;
  if (M.spyBonus) { var sp = al.filter(function (p) { return S.P[p].spy; }); if (sp.length === 1) { spy = sp[0]; gain[spy] += 1; } }
  gain.forEach(function (g, p) { S.tok[p] += g; });
  S.result = { round: S.round, why: why, win: win, hands: hands, gain: gain, spy: spy, tok: S.tok.slice(), aside: S.aside };
  S.results.push(S.result);
  S.start = win.length === 1 ? win[0] : win[Math.floor(S.rng() * win.length)];
  ev(S, { k: 'end', why: why, win: win, gain: gain, spy: spy, hands: hands });
  var done = []; S.tok.forEach(function (t, p) { if (t >= S.goal) done.push(p); });
  if (done.length) { var mx = Math.max.apply(null, done.map(function (p) { return S.tok[p]; })); S.winners = done.filter(function (p) { return S.tok[p] === mx; }); S.phase = 'over'; }
  else S.phase = 'roundEnd';
  S.need = null;
  return null;
}
L.nextRound = function (S) { if (S.phase === 'roundEnd') L.startRound(S); };

// ---------------- 推理（ベイズ）：観察者 o から見た q の手札 ----------------
// K.L[q][i] は「場に見えていないカードの数」に対する相対的な重み（尤度比）。確率は L×(見えていない枚数) を正規化したもの。
function poolOf(S, o) {   // o から見て、どこにあるか分からないカードの枚数（役ごと）
  var M = M_(S), U = M.roles.map(function (r) { return M.cnt[r] - S.pub[r]; });
  S.P[o].hand.forEach(function (r) { U[M.ri[r]]--; });
  if (S.K) S.K[o].kb.forEach(function (b) { U[M.ri[b.r]]--; });
  return U;
}
L.poolOf = poolOf;
function setDelta(S, o, q, r) { var M = M_(S), Lq = S.K[o].L[q]; M.roles.forEach(function (x, i) { Lq[i] = x === r ? 1 : 0; }); }
function beliefTie(S, o, p, t) {
  var M = M_(S), U = poolOf(S, o), A = S.K[o].L[p], B = S.K[o].L[t], C = M.roles.map(function (x, i) { return A[i] * B[i] * Math.max(0, U[i] - 1); });
  var s = C.reduce(function (a, b) { return a + b; }, 0); if (!s) return;
  S.K[o].L[p] = C.slice(); S.K[o].L[t] = C.slice();
}
L.BETA = 0.55;
// 手札 {c, x} から c を出す確率のモデル（推理用。公開情報に依存しない一般的な傾向）
function piPlay(M, c, x) {
  if (c === x) return 1;
  if (M.countess) { if (c === 'countess' && (x === 'king' || x === 'prince')) return 1; if (x === 'countess' && (c === 'king' || c === 'prince')) return 0; }
  if (M.minister && (c === 'minister' || x === 'minister') && M.val[c] + M.val[x] >= 12) return 0;
  if (c === 'princess') return 0.01; if (x === 'princess') return 0.99;
  return 1 / (1 + Math.exp(-L.BETA * (M.val[x] - M.val[c]))) * (c === 'spy' || c === 'guard' || c === 'maid' ? 1.25 : 1);
}
function beliefPlay(S, o, q, c) {   // q が c を出した（c はまだ q の手の中＝ o からは見えていない）
  var M = M_(S), K = S.K[o], Lq = K.L[q], U = poolOf(S, o), ci = M.ri[c], R = M.roles.length;
  var tot = 0; U.forEach(function (u) { tot += u; });
  var Pold = Lq.map(function (l, i) { return l * U[i]; }), sp = Pold.reduce(function (a, b) { return a + b; }, 0);
  if (sp <= 0) { Pold = U.slice(); sp = tot; }
  Pold = Pold.map(function (x) { return x / sp; });
  var dk = K.dk[q]; K.dk[q] = null;
  function pd(y, z) { if (dk != null) return M.ri[dk] === y ? 1 : 0; return tot > 1 ? Math.max(0, U[y] - (y === z ? 1 : 0)) / (tot - 1) : 0; }
  var post = [], s = 0;
  for (var x = 0; x < R; x++) {
    var v = x === ci ? Pold[ci] * pd(ci, ci) : (Pold[ci] * pd(x, ci) + Pold[x] * pd(ci, x)) * piPlay(M, c, M.roles[x]);
    post.push(v); s += v;
  }
  var Lnew = [];
  for (var y = 0; y < R; y++) { var u2 = U[y] - (y === ci ? 1 : 0); Lnew.push(s > 0 && u2 > 0 ? post[y] / s / u2 : (s > 0 ? 0 : 1)); }
  var mx = Math.max.apply(null, Lnew); if (mx > 0) Lnew = Lnew.map(function (v) { return v / mx; });
  K.L[q] = Lnew;
}
// ---------------- 観察（CPU が使ってよい情報だけ） ----------------
L.observe = function (S, p) {
  var M = M_(S);
  return { mode: S.mode, n: S.n, me: p, hand: S.P[p].hand.slice(), need: S.need ? S.need.k : null, deckN: S.deck.length, aside: S.aside != null, faceUp: S.faceUp.slice(),
    P: S.P.map(function (P) { return { out: P.out, prot: P.prot, spy: P.spy, disc: P.disc.slice() }; }), tok: S.tok.slice(), goal: S.goal, pub: Object.assign({}, S.pub),
    kn: S.kn[p].slice(), pk: S.pk.map(function (r) { return r.slice(); }),
    L: S.K ? S.K[p].L.map(function (r) { return r.slice(); }) : null, kb: S.K ? S.K[p].kb.map(function (b) { return { r: b.r, pos: b.pos }; }) : [] };
};
function obPool(ob) { var M = MODES[ob.mode], U = M.roles.map(function (r) { return M.cnt[r] - ob.pub[r]; }); ob.hand.forEach(function (r) { U[M.ri[r]]--; }); ob.kb.forEach(function (b) { U[M.ri[b.r]]--; }); return U; }
// q の手札の確率分布。bayes=false なら「数えるだけ＋確実に知っていること」
function distOf(ob, q, bayes, U) {
  var M = MODES[ob.mode], R = M.roles.length, d = [], s = 0;
  if (ob.kn[q] != null) { for (var i = 0; i < R; i++) d.push(M.roles[i] === ob.kn[q] ? 1 : 0); return d; }
  // ほかの人の確実な手札は除く
  var U2 = U.slice(); for (var r = 0; r < ob.n; r++) if (r !== q && r !== ob.me && ob.kn[r] != null && !ob.P[r].out) U2[M.ri[ob.kn[r]]] = Math.max(0, U2[M.ri[ob.kn[r]]] - 1);
  for (var j = 0; j < R; j++) { var w = U2[j] * (bayes && ob.L ? ob.L[q][j] : 1); d.push(w); s += w; }
  if (s <= 0) { s = 0; d = U2.map(function (u) { s += u; return u; }); }
  return s > 0 ? d.map(function (x) { return x / s; }) : d;
}
L.distOf = distOf;

// ---------------- 合法手 ----------------
L.legalActions = function (o, me, hand) {
  var acts = [], fi = L.forcedIdx(o.mode, hand), seen = {};
  for (var i = 0; i < hand.length; i++) {
    if (fi >= 0 && i !== fi) continue;
    var r = hand[i]; if (seen[r]) continue; seen[r] = 1;
    var tg = L.targets(o, me, r);
    if (!tg.kind || tg.none) { acts.push({ a: 'play', i: i, t: -1 }); continue; }
    tg.list.forEach(function (t) {
      if (r === 'guard') L.guessRoles(o.mode).forEach(function (g) { acts.push({ a: 'play', i: i, t: t, g: g }); });
      else acts.push({ a: 'play', i: i, t: t });
    });
  }
  return acts;
};

// ---------------- CPU：ヒューリスティック（普通＝数えるだけ／強い＝ベイズ推理） ----------------
var W0 = { kv: 0.55, kp: 0.35, ks: 0.25, el: 0.62, pr: 0.22, bl: 1.0, maid: 0.18, ch: 0.16, kg: 0.6, kx: 0.06, ps: 0.5, pd: 0.15, spy: 0.32, mn: 1.0, late: 0.6, noise: 0.03 };
L.W0 = W0;
L.W = Object.assign({}, W0);   // weights.js（自己対戦で調整）で上書き
function scoreAct(ob, a, dist, W, U) {
  var M = MODES[ob.mode], V = M.val, hand = ob.hand, c = hand[a.i], k = hand[1 - a.i], vm = M.vmax;
  var aliveOpp = 0; for (var q = 0; q < ob.n; q++) if (q !== ob.me && !ob.P[q].out) aliveOpp++;
  var EL = aliveOpp <= 1 ? 1 : W.el / Math.sqrt(aliveOpp - 1);
  var tot = 0, ev = 0; U.forEach(function (u, i) { tot += u; ev += u * V[M.roles[i]]; }); ev = tot ? ev / tot : vm / 2;
  var prog = Math.max(0, 1 - ob.deckN / (M.total - 1 - ob.n));   // 0=序盤 → 1=山がない
  var s = 0;
  if (k != null) {
    s += W.kv * (V[k] / vm) * (1 + W.late * prog);
    if (k === 'princess') s += W.kp;
    if (k === 'spy') s -= W.ks * prog;
    if (k === 'minister' && tot) { var hi = 0; U.forEach(function (u, i) { if (V[M.roles[i]] >= 5) hi += u; }); s -= W.mn * hi / tot; }
    for (var z = 0; z < ob.n; z++) if (z !== ob.me && !ob.P[z].out && ob.pk[z][ob.me] && hand[0] === k && a.i === 1) s -= 0.15;   // 見られたカードを持ち続ける
  }
  var t = a.t, d = t >= 0 && t !== ob.me ? dist(t) : null;
  switch (c) {
    case 'guard': if (d) s += d[M.ri[a.g]] * EL; break;
    case 'priest': if (d) { var mx = Math.max.apply(null, d); s += W.pr * (1 - mx); } break;
    case 'baron': if (d) { var pw = 0, pl = 0; M.roles.forEach(function (x, i) { if (V[x] < V[k]) pw += d[i]; else if (V[x] > V[k]) pl += d[i]; }); s += pw * EL - W.bl * pl; } break;
    case 'maid': s += W.maid; break;
    case 'prince':
      if (t === ob.me) { s += k === 'princess' ? -9 : W.ps * (ev - V[k]) / vm - W.kv * (V[k] / vm) * (1 + W.late * prog); }
      else if (d) { var ex = 0; M.roles.forEach(function (x, i) { ex += d[i] * V[x]; }); s += d[M.ri.princess] * EL + W.pd * (ex - ev) / vm; }
      break;
    case 'chan': if (ob.deckN > 0) s += W.ch; break;
    case 'king': if (d) { var et = 0; M.roles.forEach(function (x, i) { et += d[i] * V[x]; }); s += W.kg * (et - V[k]) / vm - W.kx - W.kv * (V[k] / vm) * (1 + W.late * prog) + W.kv * (et / vm) * (1 + W.late * prog); } break;
    case 'spy': if (M.spyBonus && !ob.P.some(function (P, q) { return q !== ob.me && !P.out && P.spy; }) && !ob.P[ob.me].spy) s += W.spy; break;
    case 'princess': s -= 9; break;
  }
  return s;
}
function heurAct(ob, bayes, W, rng) {
  var acts = L.legalActions(ob, ob.me, ob.hand), U = obPool(ob), cache = {};
  function dist(q) { return cache[q] || (cache[q] = distOf(ob, q, bayes, U)); }
  var best = null, bs = -1e9;
  acts.forEach(function (a) { var s = scoreAct(ob, a, dist, W, U) + (rng() - 0.5) * W.noise; a.s = s; if (s > bs) { bs = s; best = a; } });
  return { best: best, acts: acts };
}
function chanHeur(ob, rng, lv) {   // 3枚（または2枚）から残す1枚を決める
  var M = MODES[ob.mode], V = M.val, h = ob.hand, n = h.length, U = obPool(ob);
  if (lv === 'weak') { var kk = Math.floor(rng() * n); return { a: 'chan', keep: kk, order: shuffle(idxs(n).filter(function (i) { return i !== kk; }), rng) }; }
  var best = 0; for (var i = 1; i < n; i++) { var a = V[h[i]] + (h[i] === 'spy' ? -1.5 : 0), b = V[h[best]] + (h[best] === 'spy' ? -1.5 : 0); if (a > b) best = i; }
  var rest = idxs(n).filter(function (i) { return i !== best; });
  rest.sort(function (x, y) { return V[h[y]] - V[h[x]]; });   // 上側に強い札、いちばん下に弱い札（最後に引かれるのは弱い札）
  return { a: 'chan', keep: best, order: rest };
}
function idxs(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
function weakAct(ob, rng) {
  var acts = L.legalActions(ob, ob.me, ob.hand).filter(function (a) { return ob.hand[a.i] !== 'princess'; });
  if (!acts.length) acts = L.legalActions(ob, ob.me, ob.hand);
  if (rng() < 0.5) { var V = MODES[ob.mode].val, lo = V[ob.hand[0]] <= V[ob.hand[1]] ? 0 : 1, f = acts.filter(function (a) { return a.i === lo; }); if (f.length) acts = f; }
  var a = acts[Math.floor(rng() * acts.length)];
  if (a.g && ob.kn[a.t] && ob.kn[a.t] !== 'guard') a.g = ob.kn[a.t];
  return a;
}

// ---------------- アストラウルトラ：見えている情報と矛盾しない世界をたくさん作って、最後まで読み切る ----------------
function sampleWorld(ob, rng) {
  var M = MODES[ob.mode], U = obPool(ob), R = M.roles.length, hands = [];
  var order = shuffle(idxs(ob.n).filter(function (q) { return q !== ob.me && !ob.P[q].out; }), rng);
  for (var k = 0; k < order.length; k++) {
    var q = order[k], w = [], s = 0;
    for (var i = 0; i < R; i++) { var x = U[i] > 0 ? U[i] * (ob.kn[q] != null ? (M.roles[i] === ob.kn[q] ? 1 : 0) : (ob.L ? ob.L[q][i] : 1)) : 0; w.push(x); s += x; }
    if (s <= 0) { s = 0; w = U.map(function (u) { var v = Math.max(0, u); s += v; return v; }); }
    var r = rng() * s, j = 0; for (; j < R - 1; j++) { r -= w[j]; if (r < 0) break; }
    while (U[j] <= 0 && j < R - 1) j++;
    hands[q] = M.roles[j]; U[j]--;
  }
  var rest = []; U.forEach(function (u, i) { for (var m = 0; m < u; m++) rest.push(M.roles[i]); });
  shuffle(rest, rng);
  var aside = ob.aside ? rest.pop() : null;
  var D = rest.length + ob.kb.length, deck = new Array(D), fixed = {};   // 自分が戻したカードは、知っている位置（下から pos 番目）に
  ob.kb.forEach(function (b) { deck[D - 1 - b.pos] = b.r; fixed[D - 1 - b.pos] = 1; });
  for (var di = 0, ri = 0; di < D; di++) if (!fixed[di]) deck[di] = rest[ri++];
  return { hands: hands, deck: deck, aside: aside };
}
L.sampleWorld = sampleWorld;
function simFrom(ob, w, rng) {
  var M = MODES[ob.mode], n = ob.n;
  var S = { mode: ob.mode, n: n, rng: rng, fast: true, tok: ob.tok.slice(), goal: ob.goal, round: 1, phase: 'play', deck: w.deck.slice(), aside: w.aside, faceUp: ob.faceUp.slice(), pub: Object.assign({}, ob.pub), results: [], start: 0 };
  S.P = ob.P.map(function (P, q) { return { hand: q === ob.me ? ob.hand.slice() : (P.out ? [] : [w.hands[q]]), disc: P.disc.slice(), out: P.out, prot: P.prot, spy: P.spy }; });
  S.kn = mat(n, null); S.pk = ob.pk.map(function (r) { return r.slice(); });
  for (var q = 0; q < n; q++) for (var r = 0; r < n; r++) {
    if (q === r || S.P[r].out || S.P[q].out) continue;
    if (q === ob.me) S.kn[q][r] = ob.kn[r] != null ? S.P[r].hand[0] : null;
    else if (ob.pk[q][r]) S.kn[q][r] = S.P[r].hand[0];
  }
  S.turn = ob.me; S.need = { k: ob.need || 'play', p: ob.me };
  return S;
}
// 読み切り用の軽い手（普通と同じ考え方：数える＋確実に知っていること）
function liteOb(S, p) {
  return { mode: S.mode, n: S.n, me: p, hand: S.P[p].hand, deckN: S.deck.length, P: S.P, tok: S.tok, pub: S.pub, kn: S.kn[p], pk: S.pk, L: null, kb: [] };
}
function liteAct(S, p, rng) {
  if (S.need.k === 'chan') return chanHeur(liteOb(S, p), rng, 'normal');
  return heurAct(liteOb(S, p), false, LITE_W, rng).best;
}
var LITE_W = Object.assign({}, W0, { noise: 0.12 });
function runOut(S, rng) {
  var guard = 0;
  while (S.phase === 'play' && S.need && guard++ < 200) { var p = S.need.p, a = liteAct(S, p, rng); if (L.act(S, p, a)) L.act(S, p, L.legalActions(S, p, S.P[p].hand)[0]); }
}
function utility(S, me) {
  var r = S.result; if (!r) return 0;
  var g = r.gain, o = 0, n = 0; for (var q = 0; q < S.n; q++) if (q !== me) { o += g[q]; n++; }
  return g[me] - o / Math.max(1, n) * (S.n === 2 ? 1 : 0.8);
}
function ultraAct(ob, rng, budget) {
  budget = budget || 2400;
  var cands;
  if (ob.need === 'chan') {
    cands = [];
    var n = ob.hand.length;
    for (var k = 0; k < n; k++) { var rest = idxs(n).filter(function (i) { return i !== k; }); cands.push({ a: 'chan', keep: k, order: rest.slice() }); if (rest.length === 2) cands.push({ a: 'chan', keep: k, order: [rest[1], rest[0]] }); }
  } else {
    var h = heurAct(ob, true, L.W, rng);
    cands = h.acts.slice().sort(function (a, b) { return b.s - a.s; });
    // 門番は対象ごとに当たりやすい役の上位だけ、ほかは全部
    var per = {}, keep = [];
    cands.forEach(function (a) { var key = ob.hand[a.i] === 'guard' ? 'g' + a.t : 'x'; per[key] = (per[key] || 0) + 1; if (key === 'x' || per[key] <= 4) keep.push(a); });
    cands = keep.slice(0, 14);
  }
  if (cands.length === 1) return cands[0];
  var nw = Math.max(12, Math.min(400, Math.floor(budget / cands.length))), worlds = [];
  for (var i = 0; i < nw; i++) worlds.push(sampleWorld(ob, rng));
  var best = null, bs = -1e9;
  cands.forEach(function (a) {
    var sum = 0;
    for (var j = 0; j < nw; j++) {
      var S = simFrom(ob, worlds[j], rng), act = { a: a.a, i: a.i, t: a.t, g: a.g, keep: a.keep, order: a.order };
      if (L.act(S, ob.me, act)) { sum -= 99; continue; }
      runOut(S, rng); sum += utility(S, ob.me);
    }
    var v = sum / nw; a.v = v;
    if (v > bs) { bs = v; best = a; }
  });
  return { a: best.a, i: best.i, t: best.t, g: best.g, keep: best.keep, order: best.order };
}
// ---------------- 入口 ----------------
L.aiAct = function (S, p, lv, opt) {
  var ob = L.observe(S, p), rng = (opt && opt.rng) || S.rng;
  return L.aiFromOb(ob, lv, rng, opt);
};
L.aiFromOb = function (ob, lv, rng, opt) {
  if (ob.need === 'chan') {
    if (lv === 'ultra') return ultraAct(ob, rng, opt && opt.budget);
    return chanHeur(ob, rng, lv);
  }
  if (lv === 'weak') return weakAct(ob, rng);
  if (lv === 'normal') return clean(heurAct(ob, false, Object.assign({}, W0, { noise: 0.08 }), rng).best);
  if (lv === 'strong') return clean(heurAct(ob, true, (opt && opt.W) || L.W, rng).best);
  return ultraAct(ob, rng, opt && opt.budget);
};
function clean(a) { var o = { a: a.a, i: a.i, t: a.t }; if (a.g) o.g = a.g; return o; }

// ---------------- 画面に渡すもの（その人が見てよい情報だけ） ----------------
L.viewFor = function (S, me) {
  var M = M_(S), v = { mode: S.mode, n: S.n, round: S.round, phase: S.phase, goal: S.goal, tok: S.tok.slice(), start: S.start, k: S.evId,
    deckN: S.deck ? S.deck.length : 0, aside: S.aside != null, faceUp: (S.faceUp || []).slice(),
    P: (S.P || []).map(function (P) { return { disc: P.disc.slice(), out: P.out, prot: P.prot, spy: P.spy, nh: P.hand.length }; }),
    hand: me >= 0 && S.P ? S.P[me].hand.slice() : null, know: me >= 0 && S.kn ? S.kn[me].slice() : null,
    need: S.need ? { k: S.need.k, p: S.need.p } : null, winners: S.winners, results: S.results.map(function (r) { return { round: r.round, win: r.win.slice(), gain: r.gain.slice(), spy: r.spy, why: r.why }; }),
    result: S.result ? { round: S.result.round, why: S.result.why, win: S.result.win.slice(), gain: S.result.gain.slice(), spy: S.result.spy, tok: S.result.tok.slice(), hands: S.result.why === 'deck' ? S.result.hands.slice() : S.result.hands.map(function () { return null; }), aside: S.result.aside } : null,
    ev: S.ev.slice(-60).map(function (e) { var o = {}; for (var x in e) if (x !== 'pv') o[x] = Array.isArray(e[x]) ? e[x].slice() : e[x]; if (e.pv && me >= 0 && e.pv[me]) o.mine = JSON.parse(JSON.stringify(e.pv[me])); return o; }) };
  if (S.result && me >= 0 && S.result.why === 'last' && !S.P[me].out) v.result.hands[me] = S.P[me].hand[0];
  return v;
};

// ---------------- シミュレーション（テスト・自己対戦用） ----------------
L.simMatch = function (levels, rng, o) {
  o = o || {};
  var S = L.newMatch({ mode: o.mode || 'ed2', n: levels.length, rng: rng, start: o.start, fast: !!o.fast });
  var guard = 0;
  while (S.phase !== 'over' && guard++ < 200) {
    L.startRound(S);
    var g2 = 0;
    while (S.phase === 'play' && g2++ < 300) {
      var p = S.need.p, lv = levels[p], a = typeof lv === 'function' ? lv(S, p) : L.aiAct(S, p, lv, { budget: o.budget, rng: rng });
      var e = L.act(S, p, a); if (e) throw new Error('AI illegal: ' + e + ' ' + JSON.stringify(a) + ' hand=' + S.P[p].hand);
      if (o.check) o.check(S);
    }
  }
  return S;
};
L.setWeights = function (w) { L.W = Object.assign({}, W0, w || {}); };
if (typeof module !== 'undefined' && module.exports && !root.LL_WEIGHTS) { try { require('./weights.js'); } catch (e) {} }
var G_ = typeof globalThis !== 'undefined' ? globalThis : root;
if (G_.LL_WEIGHTS) L.setWeights(G_.LL_WEIGHTS);
if (G_.LL_BETA != null) L.BETA = G_.LL_BETA;
if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.LL = L;
})(typeof window !== 'undefined' ? window : this);
