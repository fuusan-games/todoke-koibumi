/* とどけ！こいぶみ：描画（ホスト・参加者で共通。受け取ったビューだけを使う） */
'use strict';
var ui = { gameKey: '', lastEv: 0, sayId: 0, roundKey: '', roundShownAt: 0, endKey: '', peek: false, play: null, chan: null, chanKey: '', reveals: [], revealOn: false, rulesMode: 'ed2' };
function render(v) {
  lastView = v; window.__ll.view = v;
  BGM.want(v.phase === 'game' && v.g ? (v.g.ultra ? 'epic' : 'normal') : null);
  noticeUi(v);
  if (v.phase !== 'game') { overlay('roundModal', false); closeSheets(); }
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; return; }
  if (v.phase === 'end') { show('end'); renderEnd(v); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
// ---------------- ロビー ----------------
function lvSelect(c, lv) { return '<select data-c="' + c + '" data-k="lv" class="' + (lv === 'ultra' ? 'ultra' : '') + '" aria-label="CPUの強さ">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select>'; }
function chSelect(c, ch) { return '<select data-c="' + c + '" data-k="ch" aria-label="キャラクター">' + CH_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === ch ? ' selected' : '') + '>' + CH[k].e + ' ' + CH[k].name + '</option>'; }).join('') + '</select>'; }
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length, mode = v.opts.mode, M = L.MODES[mode];
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you && s.name !== 'あなた' ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  $('modeSeg').innerHTML = L.MODE_KEYS.map(function (k) { var mx = L.MODES[k].np[1]; return '<button data-v="' + k + '" class="' + (k === mode ? 'on' : '') + '"' + (isHost && n <= mx ? '' : ' disabled') + '>' + MODE_UI[k].n + (k === 'ed2' ? '（おすすめ）' : '') + '<small>' + MODE_UI[k].s + '</small></button>'; }).join('');
  $('modeSeg').classList.toggle('ro', !isHost);
  $('modeDesc').textContent = MODE_UI[mode].d;
  var np = Math.min(M.np[1], Math.max(v.opts.np, n, M.np[0])), ks = [];
  for (var k = M.np[0]; k <= M.np[1]; k++) ks.push(k);
  $('npSeg').innerHTML = ks.map(function (k) { return '<button data-v="' + k + '" class="' + (k === np ? 'on' : '') + '"' + (isHost && k >= n ? '' : ' disabled') + '>' + k + '人<small>💌' + M.goal[k] + '</small></button>'; }).join('');
  $('npSeg').classList.toggle('ro', !isHost);
  var owners = planOwners(v.seats, v.opts), ci = 0;
  $('cpuList').innerHTML = owners.map(function (o, c) {
    if (o.kind !== 'cpu') return '<div class="crow"><span class="av" style="background:#2f6b4a">' + (c + 1) + '</span><span class="nm">' + esc(o.name) + (o.sid === v.sid && o.name !== 'あなた' ? '（あなた）' : '') + '</span></div>';
    var i = ci++;
    return '<div class="crow"><span class="av" style="background:' + CH[o.ch].col + '">' + CH[o.ch].e + '</span>' +
      (isHost ? chSelect(i, o.ch) + '<span class="nm"></span>' + lvSelect(i, o.lv) : '<span class="nm">' + esc(o.name) + '</span><span class="lv ' + o.lv + '">' + LV[o.lv] + '</span>') + '</div>';
  }).join('');
  $('lvAllSeg').innerHTML = LV_KEYS.map(function (k) { return '<button data-v="' + k + '"' + (isHost ? '' : ' disabled') + '>' + (k === 'ultra' ? 'アストラ<br>ウルトラ😎' : LV[k]) + '</button>'; }).join('');
  $('lvAllBox').style.display = ci && isHost ? '' : 'none';
  $('seatHint').textContent = v.solo ? '' : '2〜' + M.np[1] + '人で遊べます。空いた席は CPU が入ります。招待URLかQRで、各自のスマホから参加してね';
  $('startBtn').disabled = n < 1 || n > M.np[1];
  ui.rulesMode = mode;
}
// ---------------- ゲーム画面 ----------------
function nm(g, p, me) { var o = g.owners[p]; if (!o) return '?'; if (p === me) return 'あなた'; return o.kind === 'cpu' ? o.e + o.name + (o.lv === 'ultra' ? '😎' : '') : o.name; }
function rn(r) { return ROLE[r] ? ROLE[r].e + ROLE[r].n : '?'; }
function unseenCounts(g) {   // 自分から見て「どこかに隠れている」枚数
  var M = L.MODES[g.mode], c = {};
  M.roles.forEach(function (r) { c[r] = M.cnt[r]; });
  g.P.forEach(function (P) { P.disc.forEach(function (r) { c[r]--; }); });
  g.faceUp.forEach(function (r) { c[r]--; });
  (g.hand || []).forEach(function (r) { c[r]--; });
  return c;
}
function myTurn(g) { return g.need && g.need.p === g.me && g.wait <= 0 && g.phase === 'play'; }
function evText(g, e, me) {
  var N = function (p) { return esc(nm(g, p, me)); }, s = '', cls = '';
  if (e.k === 'round') { cls = 'sys'; s = '―― ラウンド' + e.round + ' スタート（' + N(e.start) + 'から）――' + (e.faceUp && e.faceUp.length ? '<br>表向きで除いた札：' + e.faceUp.map(rn).join('・') : ''); }
  else if (e.k === 'play') {
    s = N(e.p) + '：<b>' + rn(e.c) + '</b>';
    var t = e.t >= 0 ? N(e.t) : '', m = e.mine;
    if (e.res === 'blocked') s += ' → ' + t + '（ばあやに守られて効果なし）';
    else if (e.res === 'noeff') s += '（選べる人がいない／山がない → 効果なし）';
    else if (e.c === 'guard') s += ' → ' + t + 'に「' + rn(e.g) + '」？ ' + (e.res === 'hit' ? '<span class="bad">的中！</span>' : 'はずれ');
    else if (e.c === 'priest') s += ' → ' + t + 'の手札を見た' + (m ? ' <span class="pv">（' + rn(m.seen) + 'だった）</span>' : '');
    else if (e.c === 'baron') s += ' → ' + t + 'と比べた：' + (e.res === 'tie' ? '引き分け' : '<span class="bad">' + (e.res === 'win' ? t : N(e.p)) + 'の負け</span>') + (m ? ' <span class="pv">（あなた ' + rn(m.mine) + ' vs ' + rn(m.theirs) + '）</span>' : '');
    else if (e.c === 'maid') s += '（次の番まで守られる）';
    else if (e.c === 'prince') s += ' → ' + (e.t === e.p ? '自分' : t) + 'が ' + rn(e.disc) + ' を捨てた';
    else if (e.c === 'chan') s += '（山から' + e.n + '枚引いた）' + (m ? ' <span class="pv">（' + m.drew.map(rn).join('・') + '）</span>' : '');
    else if (e.c === 'king') s += ' → ' + t + 'と手札を交換' + (m ? ' <span class="pv">（' + rn(m.gave) + 'を渡して ' + rn(m.got) + 'をもらった）</span>' : '');
    else if (e.c === 'princess') s += '<span class="bad">（出してしまった…）</span>';
    else s += '（効果なし）';
  } else if (e.k === 'out') { s = '💔 <span class="bad">' + N(e.p) + ' 脱落</span>' + (e.cards && e.cards.length ? '（手札：' + e.cards.map(rn).join('・') + '）' : ''); }
  else if (e.k === 'redraw') s = '　' + N(e.p) + 'は' + (e.aside ? '伏せ札' : '山') + 'から1枚引いた' + (e.mine ? ' <span class="pv">（' + rn(e.mine.got) + '）</span>' : '');
  else if (e.k === 'chanDone') s = '　' + N(e.p) + 'は' + e.n + '枚を山の下へ戻した' + (e.mine ? ' <span class="pv">（残した：' + rn(e.mine.kept) + '／上から ' + e.mine.back.map(rn).join('→') + '）</span>' : '');
  else if (e.k === 'minister') s = '🗝️ ' + N(e.p) + '：' + e.cards.map(rn).join('＋') + ' で合計12以上…';
  else if (e.k === 'end') { cls = 'sys'; s = '🏁 ' + (e.why === 'deck' ? '山がなくなった！ ' : '') + e.win.map(N).join('・') + ' の勝ち 💌' + (e.spy >= 0 ? '／🐦うわさ鳥ボーナス：' + N(e.spy) : ''); }
  else return '';
  return '<div class="ln ' + cls + '">' + s + '</div>';
}
function rowHtml(g, p, me) {
  var o = g.owners[p], P = g.P[p], cls = 'pr';
  if (g.need && g.need.p === p && g.phase === 'play') cls += ' cur';
  if (p === me) cls += o.name === 'あなた' ? ' me noTag' : ' me';
  if (o.kind === 'cpu' && o.lv === 'ultra') cls += ' ultra';
  if (P.out) cls += ' out';
  if (!o.connected) cls += ' off';
  var face = o.kind === 'cpu' ? o.e : '👤', tags = '';
  if (P.prot) tags += '<span class="tagS prot">🧶守</span>';
  if (P.spy && L.MODES[g.mode].spyBonus) tags += '<span class="tagS spy">🐦</span>';
  if (P.out) tags += '<span class="tagS out">脱落</span>';
  else {
    if (g.know && g.know[p] && p !== me) tags += '<span class="kn" title="あなたが知っている手札">👁' + ROLE[g.know[p]].e + ROLE[g.know[p]].n + '</span>';
    if (p !== me) for (var i = 0; i < P.nh; i++) tags += '<i class="hb"></i>';
  }
  if (g.thinking === p && o.kind === 'cpu') tags += '<span class="tagS think">💭</span>';
  var disc = P.disc.map(function (r, i) { return miniHtml(g.mode, r, ui.fresh && ui.fresh[p] && i >= P.disc.length - ui.fresh[p] ? 'new' : ''); }).join('');
  var tk = ''; for (var k = 0; k < Math.min(g.tok[p], 8); k++) tk += '💌';
  return '<div class="' + cls + '" data-p="' + p + '"><span class="fc">' + face + '</span><div class="pi"><div class="pn">' + esc(o.name) + (o.kind === 'cpu' && o.lv === 'ultra' ? '😎' : '') + (o.connected ? '' : '📵') + '</div><div class="pt">' + (tk ? '<span class="tk">' + tk + '</span>' : '💌') + ' ' + g.tok[p] + '/' + g.goal + '</div></div>' +
    '<div class="pd">' + (disc || '<span class="none">まだ出していない</span>') + '</div><div class="ps">' + tags + '</div></div>';
}
function renderPile(g) {
  var h = '<div>' + cardHtml(g.mode, null) + '</div><span class="dn">山 ' + g.deckN + '枚</span>' + (g.aside ? '<span style="opacity:.8">伏せ札1</span>' : '<span style="opacity:.8">伏せ札なし</span>');
  if (g.faceUp.length) h += '<div class="fu">' + g.faceUp.map(function (r) { return miniHtml(g.mode, r); }).join('') + '</div>';
  $('pile').innerHTML = h;
}
function renderLog(g, me) {
  var lines = g.ev.map(function (e) { return evText(g, e, me); }).filter(Boolean).slice(-40).join('');
  var lg = $('log'); if (lg.dataset.k !== String(g.k)) { lg.innerHTML = lines || '<div class="ln">ログ</div>'; lg.scrollTop = lg.scrollHeight; lg.dataset.k = g.k; }
}
function renderHand(g, me) {
  var box = $('handArea'), my = myTurn(g) && g.need.k === 'play';
  box.classList.toggle('my', my);
  if (me < 0) { box.innerHTML = '<div class="outmsg">観戦中</div>'; return; }
  var P = g.P[me];
  if (P.out) { box.innerHTML = '<div class="outmsg">💔 このラウンドは脱落…<br><small>次のラウンドを待とう</small></div>'; return; }
  var fi = my ? L.forcedIdx(g.mode, g.hand) : -1, h = '';
  g.hand.forEach(function (r, i) {
    var c = '';
    if (my) c = fi >= 0 && i !== fi ? 'no' : 'can';
    if (g.hand.length === 2 && i === 1 && g.need && g.need.p === me) c += ' drawn';
    h += cardHtml(g.mode, r, c, ' data-i="' + i + '"');
  });
  if (g.hand.length < 2) {
    var kn = [], know = g.know || [];
    know.forEach(function (r, q) { if (r && q !== me && !g.P[q].out) kn.push(esc(nm(g, q, me)) + '＝<b>' + rn(r) + '</b>'); });
    h += '<div class="info">あなたの手札' + (kn.length ? '<br>👁 知っている手札：<br>' + kn.join('<br>') : '<br><span style="opacity:.7">自分の番に1枚引いて、どちらかを出します</span>') + '</div>';
  }
  box.innerHTML = h;
}
function paintStatus(g, me) {
  var st = '', cls = '', nd = g.need;
  if (g.wait > 0) st = g.ultra ? '…なにかが 目覚めようとしている…' : 'まもなく開始…';
  else if (g.phase !== 'play') st = g.phase === 'over' ? '🎉 ゲーム終了！' : 'ラウンド' + g.round + ' 終了';
  else if (myTurn(g)) {
    cls = 'mine';
    if (nd.k === 'chan') st = '📜 司書：残すカードを1枚えらんでね';
    else if (L.forcedIdx(g.mode, g.hand) >= 0) st = 'あなたの番！ 💃令嬢を出さなければなりません';
    else st = 'あなたの番！ 出すカードをタップしてね';
  } else if (nd) {
    var ow = g.owners[nd.p];
    st = ow.kind === 'cpu' ? ow.e + ' ' + esc(nm(g, nd.p, me)) + ' が考え中…' : esc(nm(g, nd.p, me)) + ' の番です' + (ow.connected ? '' : '（切断中）');
  }
  $('status').innerHTML = st; $('status').className = 'status ' + cls;
}
function popText(text, cls) { var p = $('pop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = 'go ' + (cls || ''); }
function flashRow(p, cls) { var row = $('players').querySelector('.pr[data-p="' + p + '"]'); if (!row) return; row.classList.remove(cls); void row.offsetWidth; row.classList.add(cls); setTimeout(function () { row.classList.remove(cls); }, 1200); }
function onEvent(v, e, me, live) {
  var g = v.g, o = e.p != null ? g.owners[e.p] : null, ultra = o && o.kind === 'cpu' && o.lv === 'ultra';
  if (e.k === 'play') {
    ui.fresh = ui.fresh || {}; ui.fresh[e.p] = (ui.fresh[e.p] || 0) + 1;
    if (e.mine && (e.p !== me || e.c !== 'chan')) queueReveal(g, e, me);
    if (!live) return;
    sfx.card();
    if (e.t >= 0 && e.t !== e.p) setTimeout(function () { flashRow(e.t, 'tgt'); }, 50);
    if (e.c === 'guard' && e.res === 'hit') { popText('🛡️ 的中！「' + ROLE[e.g].n + '」', 'bad'); if (ultra) cutin('門番 的中！', '「' + ROLE[e.g].n + '」…読みどおり', o.e); }
    else if (e.c === 'baron' && e.res !== 'tie' && e.res !== 'noeff' && e.res !== 'blocked') { popText('⚔️ 剣士の勝負！', 'bad'); if (ultra && e.res === 'win') cutin('剣士 勝利！', '勝てる勝負しか しない', o.e); }
    else popText(ROLE[e.c].e + ' ' + ROLE[e.c].n + (e.res === 'miss' ? '…はずれ' : e.res === 'blocked' ? '…守られた' : '！'), e.c === 'princess' ? 'bad' : 'info');
  } else if (e.k === 'out') {
    if (!live) return;
    setTimeout(function () { flashRow(e.p, 'hitfx'); }, 60); sfx.bust();
    setTimeout(function () { popText('💔 ' + nm(g, e.p, me) + ' 脱落', 'bad'); }, 700);
    if (e.p === me) vibrate([60, 40, 120]);
  } else if (e.k === 'redraw') { if (live && e.mine && e.p === me) toast('錬金術師で 引き直し → ' + ROLE[e.mine.got].e + ROLE[e.mine.got].n); }
  else if (e.k === 'minister') { if (live) popText('🗝️ 家令：合計12以上！', 'bad'); }
  else if (e.k === 'end') { if (live) { if (e.win.indexOf(me) >= 0) sfx.win(); else sfx.safe(); } }
  else if (e.k === 'round') { ui.fresh = {}; if (live) popText('ラウンド' + e.round, 'info'); }
  else if (e.k === 'draw' && live && e.p === me) sfx.turn();
}
// 秘密の結果（吟遊詩人・剣士・大公）は本人にだけポップアップ
function queueReveal(g, e, me) {
  var m = e.mine, h = '', t = '';
  if (e.c === 'priest' && m.seen) { t = '🎻 ' + nm(g, e.t, me) + 'の手札'; h = '<div class="reveal"><div>' + cardHtml(g.mode, m.seen) + '<div class="lb">' + esc(nm(g, e.t, me)) + '</div></div></div>'; }
  else if (e.c === 'baron' && m.mine) {
    var other = e.p === me ? e.t : e.p, res = e.res === 'tie' ? '引き分け！' : ((e.res === 'win') === (e.p === me) ? 'あなたの勝ち！' : 'あなたの負け…');
    t = '⚔️ 剣士の勝負：' + res;
    h = '<div class="reveal"><div>' + cardHtml(g.mode, m.mine) + '<div class="lb">あなた</div></div><span class="vs">VS</span><div>' + cardHtml(g.mode, m.theirs) + '<div class="lb">' + esc(nm(g, other, me)) + '</div></div></div>';
  } else if (e.c === 'king' && m.got) { t = '🎩 交換：' + nm(g, e.p === me ? e.t : e.p, me) + 'と'; h = '<div class="reveal"><div>' + cardHtml(g.mode, m.gave) + '<div class="lb">渡した</div></div><span class="vs">→</span><div>' + cardHtml(g.mode, m.got) + '<div class="lb">もらった</div></div></div>'; }
  else return;
  ui.reveals.push({ t: t, h: h }); nextReveal();
}
function nextReveal() {
  if (ui.revealOn || !ui.reveals.length) return;
  var r = ui.reveals.shift(); ui.revealOn = true;
  $('rvTitle').textContent = r.t; $('rvBody').innerHTML = r.h; overlay('revealModal', true);
}
$('rvOk').onclick = function () { overlay('revealModal', false); ui.revealOn = false; setTimeout(nextReveal, 120); };
function renderGame(v) {
  var g = v.g, me = g.me, gk = v.code + ':' + v.gameNo;
  if (ui.gameKey !== gk) {
    ui.gameKey = gk; ui.lastEv = g.ev.length ? g.ev[g.ev.length - 1].id : 0; ui.sayId = g.say ? g.say.id : 0; ui.roundKey = ''; ui.fresh = {}; ui.reveals = []; ui.revealOn = false; overlay('revealModal', false);
    if (g.ultra && g.wait > 600) awaken(g.ultra);
  }
  var evs = g.ev.filter(function (e) { return e.id > ui.lastEv; });
  if (evs.length) ui.lastEv = evs[evs.length - 1].id;
  var lastId = evs.length ? evs[evs.length - 1].id : 0;
  evs.forEach(function (e) { if (e.k === 'play' || e.k === 'round') onEvent(v, e, me, false); });
  var M = L.MODES[g.mode];
  $('phLabel').textContent = 'R' + g.round + '・' + MODE_UI[g.mode].n + '・💌' + g.goal + 'で優勝';
  $('players').innerHTML = g.owners.map(function (o, p) { return rowHtml(g, p, me); }).join('');
  [].forEach.call(document.querySelectorAll('#players .pd'), function (d) { d.scrollLeft = d.scrollWidth; });   // 新しい捨て札が見えるように
  renderPile(g); renderLog(g, me); renderHand(g, me); paintStatus(g, me);
  evs.forEach(function (e) { if (e.k !== 'round') onEvent(v, e, me, evs.length < 6 || e.id >= lastId - 2); else if (evs.length < 6) popText('ラウンド' + e.round, 'info'); });
  if (g.say && g.say.id !== ui.sayId) {
    ui.sayId = g.say.id; var o = g.owners[g.say.p];
    var b = document.createElement('div'); b.className = 'bubble' + (o && o.lv === 'ultra' ? ' ultra' : ''); b.textContent = (o ? o.e + o.name : '') + '「' + g.say.text + '」';
    var gw = document.querySelector('#game .gwrap'); gw.querySelectorAll('.bubble').forEach(function (x) { x.remove(); });
    b.style.top = ($('table').offsetTop + 4) + 'px'; gw.appendChild(b); setTimeout(function () { b.remove(); }, 3200);
  }
  // 自分の番でなくなったら操作シートを閉じる
  if (!(myTurn(g) && g.need.k === 'play')) closeSheet('playSheet');
  else if (ui.play && ui.play.k !== g.k) closeSheet('playSheet');
  if (myTurn(g) && g.need.k === 'chan') openChan(g); else closeSheet('chanSheet');
  // ラウンド結果
  var ended = g.phase !== 'play' && g.result;
  if (ended) {
    var rk = gk + ':' + g.round, dl = 1600 * (TURBO ? 0.2 : 1);
    if (ui.roundKey !== rk) { ui.roundKey = rk; ui.peek = false; ui.roundShownAt = Date.now() + dl; setTimeout(function () { if (lastView && lastView.phase === 'game') renderGame(lastView); }, dl + 50); }
    if (Date.now() >= ui.roundShownAt) { renderRound(v, g.result, true); overlay('roundModal', true); }
  } else if (ui.peek && g.results.length) { renderRound(v, g.results[g.results.length - 1], false); overlay('roundModal', true); }
  else overlay('roundModal', false);
  if ($('refModal').classList.contains('active')) renderRef();
}
// ---------------- 出すカードのシート ----------------
function closeSheet(id) { if ($(id).classList.contains('active')) { overlay(id, false); if (id === 'playSheet') ui.play = null; if (id === 'chanSheet') ui.chanKey = ''; } $('sheetBg').classList.toggle('active', $('playSheet').classList.contains('active') || $('chanSheet').classList.contains('active')); }
function closeSheets() { closeSheet('playSheet'); closeSheet('chanSheet'); }
function openPlay(i) {
  var v = lastView, g = v && v.g; if (!g || !myTurn(g) || g.need.k !== 'play') return;
  var fi = L.forcedIdx(g.mode, g.hand);
  if (fi >= 0 && i !== fi) { toast('大公か錬金術師と一緒のときは、令嬢を出さなければなりません'); return; }
  var r = g.hand[i], tg = L.targets({ mode: g.mode, n: g.n, P: g.P }, g.me, r);
  ui.play = { i: i, r: r, t: tg.kind && !tg.none && tg.list.length === 1 && r !== 'guard' ? tg.list[0] : (tg.kind && !tg.none && tg.list.length === 1 ? tg.list[0] : -1), g: null, k: g.k };
  renderPlay(); overlay('playSheet', true); $('sheetBg').classList.add('active');
}
function renderPlay() {
  var v = lastView, g = v.g, me = g.me, P = ui.play; if (!P) return;
  var r = P.r, tg = L.targets({ mode: g.mode, n: g.n, P: g.P }, me, r), M = L.MODES[g.mode];
  var h = '<div class="shHead">' + cardHtml(g.mode, r) + '<div class="tx"><h4>' + ROLE[r].e + ' ' + ROLE[r].n + '（' + M.val[r] + '）を出す</h4>' + roleDesc(g.mode, r) + '</div></div>';
  if (r === 'princess') h += '<p class="mid" style="color:var(--ng)">⚠️ 王女を出すと、あなたは脱落します！</p>';
  if (r === 'prince' && P.t === me && g.hand[1 - P.i] === 'princess') h += '<p class="mid" style="color:var(--ng)">⚠️ 自分を選ぶと王女を捨てることになり、脱落します！</p>';
  if (tg.kind) {
    if (tg.none) h += '<p class="mid" style="font-size:13px">選べる人がいないので、<b>効果なし</b>で出します。</p>';
    else {
      h += '<div class="shLab">' + (tg.kind === 'any' ? 'だれを選ぶ？（自分もOK）' : 'だれを選ぶ？') + '</div><div class="tgts">' + tg.list.map(function (q) {
        var sub = g.P[q].prot ? '🧶守られている（効果なし）' : (g.know && g.know[q] && q !== me ? '👁' + ROLE[g.know[q]].n : '');
        return '<button data-t="' + q + '" class="' + (P.t === q ? 'on' : '') + '">' + (q === me ? '自分' : esc(nm(g, q, me))) + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
      }).join('') + '</div>';
      if (r === 'guard') {
        var un = unseenCounts(g);
        h += '<div class="shLab">どの役だと思う？（門番以外）' + (P.t >= 0 ? '' : '<small style="opacity:.6">← 先に相手を選んでね</small>') + '</div><div class="guesses">' + L.guessRoles(g.mode).slice().reverse().map(function (x) {
          return '<button data-g="' + x + '" class="' + (P.g === x ? 'on' : '') + (un[x] <= 0 ? ' zero' : '') + '">' + ROLE[x].e + ROLE[x].n + '<small>強さ' + M.val[x] + '・のこり' + Math.max(0, un[x]) + '</small></button>';
        }).join('') + '</div>';
      }
    }
  }
  var ready = !tg.kind || tg.none || (P.t >= 0 && (r !== 'guard' || P.g));
  h += '<div class="shBtns"><button class="btn" id="plNo">やめる</button><button class="btn main" id="plYes"' + (ready && !pending ? '' : ' disabled') + '>' + ROLE[r].e + ' 出す</button></div>';
  $('playBox').innerHTML = h;
}
$('playBox').addEventListener('click', function (e) {
  var P = ui.play; if (!P) return;
  var t = e.target.closest('[data-t]'), gg = e.target.closest('[data-g]');
  if (t) { P.t = +t.dataset.t; renderPlay(); return; }
  if (gg) { if (P.t < 0) { toast('先に相手を選んでね'); return; } P.g = gg.dataset.g; renderPlay(); return; }
  if (e.target.id === 'plNo') { closeSheet('playSheet'); return; }
  if (e.target.id === 'plYes') {
    var g = lastView.g, tg = L.targets({ mode: g.mode, n: g.n, P: g.P }, g.me, P.r);
    var a = { i: P.i, t: tg.kind && !tg.none ? P.t : -1 }; if (P.r === 'guard' && a.t >= 0) a.g = P.g;
    var go = function () { closeSheet('playSheet'); act('play', a); };
    if (P.r === 'princess' || (P.r === 'prince' && a.t === g.me && g.hand[1 - P.i] === 'princess')) confirmBox('本当に出しますか？', '王女を捨てると、このラウンドは脱落です。', '出す', go); else go();
  }
});
$('handArea').addEventListener('click', function (e) { var c = e.target.closest('.cd[data-i]'); if (c) openPlay(+c.dataset.i); });
$('sheetBg').addEventListener('click', function () { if (ui.play) closeSheet('playSheet'); });
// ---------------- 司書 ----------------
function openChan(g) {
  var key = g.k + ':' + g.hand.join(',');
  if (ui.chanKey === key) return;
  ui.chanKey = key; ui.chan = { keep: -1, bottom: -1 };
  renderChan(); overlay('chanSheet', true); $('sheetBg').classList.add('active');
}
function renderChan() {
  var g = lastView.g, C = ui.chan, n = g.hand.length;
  var rest = []; for (var i = 0; i < n; i++) if (i !== C.keep) rest.push(i);
  if (C.keep >= 0 && rest.length === 2 && rest.indexOf(C.bottom) < 0) C.bottom = rest[1];
  var h = '<div class="shHead"><div class="tx"><h4>📜 司書：1枚だけ残す</h4>残すカードをタップ。残りは山の<b>いちばん下</b>へ戻します' + (n === 3 ? '（戻す2枚のうち、<b>いちばん下</b>にするカードもタップで選べます）' : '') + '。令嬢の強制は、ここではかかりません。</div></div><div class="chanCards">' +
    g.hand.map(function (r, i) { var c = i === C.keep ? 'keep' : C.keep >= 0 ? (rest.length === 2 ? (i === C.bottom ? 'b2' : 'b1') : 'b2') : ''; return cardHtml(g.mode, r, c, ' data-ci="' + i + '"'); }).join('') + '</div>';
  h += '<div class="shBtns"><button class="btn main" id="chYes"' + (C.keep >= 0 && !pending ? '' : ' disabled') + '>これで決定</button></div>';
  $('chanBox').innerHTML = h;
}
$('chanBox').addEventListener('click', function (e) {
  var C = ui.chan; if (!C) return;
  var c = e.target.closest('[data-ci]');
  if (c) { var i = +c.dataset.ci; if (C.keep < 0 || i === C.keep) C.keep = i; else if (C.keep >= 0) { if (i === C.bottom) C.keep = i; else C.bottom = i; } renderChan(); return; }
  if (e.target.id === 'chYes' && C.keep >= 0) {
    var g = lastView.g, rest = []; for (var j = 0; j < g.hand.length; j++) if (j !== C.keep) rest.push(j);
    var order = rest.length === 2 ? (rest[0] === C.bottom ? [rest[1], rest[0]] : [rest[0], rest[1]]) : rest;
    act('chan', { keep: C.keep, order: order });
  }
});
// ---------------- ラウンド結果・終了 ----------------
function renderRound(v, r, live) {
  var g = v.g, me = g.me;
  $('rdTitle').textContent = (g.phase === 'over' && live ? '🎉 最終ラウンドの結果' : 'ラウンド' + r.round + ' の結果');
  $('rdHead').innerHTML = (r.why === 'deck' ? '山がなくなった！ 手札を見せ合って勝負' : esc(nm(g, r.win[0], me)) + ' だけが残った！') + (r.aside && live ? '<br><small style="opacity:.75">伏せ札は ' + rn(r.aside) + ' でした</small>' : '');
  var tok = r.tok || g.tok;
  $('rdList').innerHTML = g.owners.map(function (o, p) {
    var hand = r.hands && r.hands[p], win = r.win.indexOf(p) >= 0, gain = r.gain[p];
    return '<div class="rr' + (win ? ' win' : '') + '"><span>' + (o.kind === 'cpu' ? o.e : '👤') + '</span><span class="nm">' + esc(p === me ? 'あなた' : o.name + (o.kind === 'cpu' && o.lv === 'ultra' ? '😎' : '')) + (win ? ' 👑' : '') + '</span>' + (hand ? chipHtml(g.mode, hand) : (g.P[p].out && live ? '<span class="tagS out">脱落</span>' : '')) +
      (gain ? '<span class="gain">+' + gain + (r.spy === p ? '（🐦込み）' : '') + '</span>' : '') + '<span class="tk">💌' + (tok ? tok[p] : '') + '</span></div>';
  }).join('') + (r.spy >= 0 ? '<p class="hint" style="text-align:center">🐦 うわさ鳥ボーナス：' + esc(nm(g, r.spy, me)) + ' +1</p>' : '');
  var next = '';
  if (live && g.nextIn != null) next = g.phase === 'over' ? 'まもなく結果発表…' : '次のラウンドまで ' + Math.ceil(g.nextIn / 1000) + '秒';
  $('rdNext').textContent = next;
  $('rdGo').style.display = live && (g.phase === 'roundEnd' || g.phase === 'over') ? '' : 'none';
  $('rdGo').textContent = g.phase === 'over' ? '▶ 結果を見る' : '▶ 次のラウンドへ';
  $('rdClose').style.display = live ? 'none' : '';
}
function renderEnd(v) {
  var g = v.g; if (!g) return;
  var me = g.me, rows = g.owners.map(function (o, p) { return { o: o, p: p, sc: g.tok[p] }; }).sort(function (a, b) { return b.sc - a.sc; });
  var rank = 0, wins = g.winners || [];
  $('rankList').innerHTML = rows.map(function (r, i) {
    if (i === 0 || r.sc < rows[i - 1].sc) rank = i + 1;
    return '<div class="rk' + (wins.indexOf(r.p) >= 0 ? ' first' : '') + '"><span class="md">' + (['🥇', '🥈', '🥉'][rank - 1] || rank) + '</span><span class="nm">' + (r.o.kind === 'cpu' ? r.o.e + ' ' : '') + esc(r.o.name) +
      (r.o.kind === 'cpu' ? ' <span class="lv ' + r.o.lv + '" style="font-size:10px">' + LV[r.o.lv] + '</span>' : '') + (r.p === me && r.o.name !== 'あなた' ? '<small>あなた</small>' : '') + '</span><span class="sc">💌' + r.sc + '</span></div>';
  }).join('');
  var w0 = g.owners[wins[0]], txt;
  if (wins.length > 1) txt = '🤝 ' + wins.map(function (p) { return esc(nm(g, p, me)); }).join('・') + ' の同時優勝！';
  else if (w0.kind === 'cpu') txt = w0.e + '「' + esc(pick(CH[w0.ch].L.mwin)) + '」';
  else { var loser = g.owners.filter(function (o) { return o.kind === 'cpu'; })[0]; txt = '🎉 ' + esc(w0.name) + ' の こいぶみが 王女に届いた！' + (loser ? ' ' + loser.e + '「' + esc(pick(CH[loser.ch].L.mlose)) + '」' : ''); }
  $('rankList').innerHTML += '<p class="mid">' + txt + '</p>';
  $('histLine').innerHTML = (g.results || []).map(function (r) { return 'R' + r.round + '：' + r.win.map(function (p) { return esc(nm(g, p, me)); }).join('・') + (r.why === 'deck' ? '' : '（最後の1人）'); }).join('<br>');
  $('leaveBtn2').textContent = host ? (host.room.solo ? '🚪 タイトルへ' : '🚪 部屋を閉じる') : '🚪 部屋を出る';
  var key = v.code + ':' + v.gameNo;
  if (ui.endKey !== key) { ui.endKey = key; if (wins.indexOf(me) >= 0) { confetti(80); sfx.win(); } else sfx.safe(); }
}
// ---------------- カード一覧（残り枚数つき） ----------------
function renderRef() {
  var v = lastView, g = v && v.phase === 'game' && v.g, mode = g ? g.mode : (v && v.opts ? v.opts.mode : ui.rulesMode), M = L.MODES[mode], un = g ? unseenCounts(g) : null;
  $('refNote').innerHTML = MODE_UI[mode].n + '（' + MODE_UI[mode].s + '）' + (g ? '<br>「見えていない」＝ 出された札・表向きの札・あなたの手札 以外' : '');
  $('refList').innerHTML = M.roles.slice().reverse().map(function (r) {
    return '<div class="refRow' + (un && un[r] <= 0 ? ' gone' : '') + '">' + cardHtml(mode, r) + '<div class="tx"><h4>' + ROLE[r].n + '<small>強さ' + M.val[r] + '・全' + M.cnt[r] + '枚' + (un ? '・見えていない ' + Math.max(0, un[r]) : '') + '</small></h4>' + roleDesc(mode, r) + '</div></div>';
  }).join('');
}
