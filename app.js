/* とどけ！こいぶみ：流れ・ボタン操作・タイトル（最後に読み込む） */
'use strict';
window.__ll = { bgm: function () { return BGM.state(); }, bgmLevel: function () { return BGM.level(); }, view: null, autoplay: false,
  act: function (a, v) { act(a, v); }, awaken: function (c) { awaken(c); }, cutin: cutin,
  role: function () { return host ? 'host' : client ? 'client' : 'none'; }, hostRoom: function () { return host ? host.room : null; }, refresh: function () { if (host) hostBroadcast(); } };

// ---- 操作（ホストも参加者も同じ入口） ----
function act(a, val) {
  var v = lastView; if (!v || v.phase !== 'game' || !v.g) return;
  unlockAudio();
  var m = { t: 'act', a: a, v: val, g: v.gameNo, k: v.g.k };
  if (host) { var err = hostAction(1, m); if (err) toast(err); return; }
  var key = a + ':' + m.k;
  if (pending === key) return;
  if (send(m)) { pending = key; }
}
// ---- ホストのロビー操作 ----
$('seatList').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-sid]'); if (!b || !host) return;
  var R = host.room, seat = seatBySid(+b.dataset.sid);
  if (!seat || seat.kind !== 'remote' || R.phase !== 'lobby') return;
  var doRemove = function () {
    var c = host.conns[seat.clientId]; if (c) { try { c.send({ t: 'kicked' }); } catch (x) {} setTimeout(function () { try { c.close(); } catch (x) {} }, 300); delete host.conns[seat.clientId]; }
    R.seats.splice(R.seats.indexOf(seat), 1); hostBroadcast();
  };
  if (seat.connected) confirmBox(seat.name + 'を外しますか？', '部屋から退出させます。', '外す', doRemove); else doRemove();
});
$('cpuList').addEventListener('change', function (e) {
  var s = e.target.closest('select[data-c]'); if (!s || !host || host.room.phase !== 'lobby') return;
  var cpu = host.room.opts.cpu, i = +s.dataset.c;
  if (s.dataset.k === 'lv' && LV_KEYS.indexOf(s.value) >= 0) cpu[i].lv = s.value;
  if (s.dataset.k === 'ch' && CH[s.value]) { var j = cpu.map(function (c) { return c.ch; }).indexOf(s.value); if (j >= 0 && j !== i) cpu[j].ch = cpu[i].ch; cpu[i].ch = s.value; }   // 同じキャラは入れかえ
  hostBroadcast();
});
function segClick(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b || b.disabled || !host || host.room.phase !== 'lobby') return; fn(b.dataset.v); hostBroadcast(); }); }
segClick('lvAllSeg', function (v) { host.room.opts.cpu.forEach(function (c) { c.lv = v; }); });
segClick('npSeg', function (v) { if (+v >= host.room.seats.length) host.room.opts.np = +v; });
segClick('modeSeg', function (v) { if (!L.MODES[v] || host.room.seats.length > L.MODES[v].np[1]) return; var o = host.room.opts; o.mode = v; o.np = Math.min(L.MODES[v].np[1], Math.max(o.np, L.MODES[v].np[0])); });
$('startBtn').onclick = function () { if (host) { unlockAudio(); hostStartGame(); } };
$('againBtn').onclick = function () { if (host && host.room.phase === 'end') hostStartGame(); };
$('toLobbyBtn').onclick = function () { if (host && host.room.phase === 'end') hostToLobby('ロビーに戻りました'); };
$('rdGo').onclick = function () { if (host && host.room.G && host.room.G.roundEndAt) host.room.G.roundEndAt = Date.now(); };
$('rdClose').onclick = function () { ui.peek = false; overlay('roundModal', false); };
function copyUrl() {
  var u = $('inviteUrl').textContent;
  function legacy() { try { var ta = document.createElement('textarea'); ta.value = u; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, u.length); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
  var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(u) : Promise.reject();
  p.then(function () { toast('招待URLをコピーしました'); }, function () { toast(legacy() ? '招待URLをコピーしました' : 'URLを長押ししてコピーしてください'); });
}
$('copyBtn').onclick = copyUrl;
$('shareBtn').onclick = function () {
  var data = { title: GAME_TITLE, text: 'いっしょに「' + GAME_TITLE + '」で遊ぼう！ 部屋コード ' + $('codeBig').textContent, url: $('inviteUrl').textContent };
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return copyUrl();
  try { navigator.share(data).catch(function (e) { if (!e || e.name !== 'AbortError') copyUrl(); }); } catch (e) { copyUrl(); }
};
// ---- 退出・メニュー ----
function leaveRoom() {
  if (host) {
    var solo = host.room.solo;
    confirmBox(solo ? 'ゲームをやめますか？' : '部屋を閉じますか？', solo ? 'タイトルに戻ります。' : '参加者全員の接続が切れ、ゲームは終了します。', solo ? 'やめる' : '部屋を閉じる', function () {
      Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send({ t: 'closed' }); } catch (e) {} });
      store(LS_HOST, null);
      setTimeout(function () { try { if (host.peer) host.peer.destroy(); } catch (e) {} location.href = location.pathname + location.search.replace(/([?&])room=[^&]*/, '$1'); }, 300);
    });
  } else confirmBox('部屋を出ますか？', 'ゲーム中に出た場合も、同じニックネームで入り直せば元の席に戻れます。', '部屋を出る', function () { sstore(SS_CLIENT, null); leaveClient(true); });
}
$('leaveBtn1').onclick = $('leaveBtn2').onclick = leaveRoom;
$('menuBtn').onclick = function () { overlay('menuModal', true); };
function confirmAbort() {
  confirmBox('中断してロビーに戻りますか？', 'いまのゲームを終了して、全員をこの部屋のロビーに戻します。部屋コード・参加者・設定はそのままです。', '中断してロビーへ', function () {
    if (host && host.room.phase !== 'lobby') hostToLobby('⏸️ ホストがゲームを中断しました');
  });
}
$('menuAbort').onclick = function () { overlay('menuModal', false); confirmAbort(); };
$('menuReq').onclick = function () { overlay('menuModal', false); if (send({ t: 'lobbyReq' })) toast('ホストに「ロビーに戻りたい」と伝えました'); };
$('menuLeave').onclick = function () { overlay('menuModal', false); leaveRoom(); };
function openRules(mode) {
  ui.rulesMode = mode || ui.rulesMode || 'ed2';
  $('rulesSeg').innerHTML = L.MODE_KEYS.map(function (k) { return '<button data-v="' + k + '" class="' + (k === ui.rulesMode ? 'on' : '') + '">' + MODE_UI[k].n + '</button>'; }).join('');
  $('rulesList').innerHTML = rulesHtml(ui.rulesMode); overlay('rulesModal', true);
}
$('rulesSeg').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) { openRules(b.dataset.v); $('rulesModal').querySelector('.card').scrollTop = 0; } });
function curMode() { var v = lastView; return v && v.g ? v.g.mode : v && v.opts ? v.opts.mode : 'ed2'; }
$('rulesBtn1').onclick = function () { openRules('ed2'); };
$('rulesBtn2').onclick = $('menuRules').onclick = function () { overlay('menuModal', false); openRules(curMode()); };
$('rulesClose').onclick = function () { overlay('rulesModal', false); };
$('refBtn1').onclick = $('refBtn2').onclick = $('menuRef').onclick = function () { overlay('menuModal', false); renderRef(); overlay('refModal', true); };
$('refClose').onclick = function () { overlay('refModal', false); };
['rulesModal', 'menuModal', 'refModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) overlay(id, false); }); });
$('menuRound').onclick = function () {
  overlay('menuModal', false); var v = lastView;
  if (!v || !v.g || !v.g.results.length) { toast('まだ終わったラウンドはありません'); return; }
  ui.peek = true; renderGame(v);
};
$('menuClose').onclick = function () { overlay('menuModal', false); };
$('lobbyReqBar').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-lr]'); if (!b || !host) return;
  if (b.dataset.lr === 'no') { host.room.lobbyReq = null; hostBroadcast(); } else confirmAbort();
});
// ---------------- タイトル ----------------
function renderTitle() {
  if (!$('nameIn').value) $('nameIn').value = load(LS_NAME) || '';
  var inv = normCode(Q.get('room'));
  $('inviteJoinBox').style.display = inv.length === 4 ? '' : 'none';
  $('invCode').textContent = inv;
  if (inv.length === 4) $('codeIn').value = inv;
  var saved = load(LS_HOST, true), ok = saved && saved.room && Date.now() - saved.saved < 12 * 3600 * 1000;
  $('resumeBtn').style.display = ok ? '' : 'none';
  if (ok) $('resumeBtn').textContent = saved.room.solo ? '前回のひとり用ゲームを再開する' : '前回の部屋（' + saved.room.code + '）を再開する';
  var joined = sload(SS_CLIENT);
  $('rejoinBtn').style.display = joined ? '' : 'none';
  if (joined) $('rejoinBtn').textContent = '部屋 ' + joined.code + ' に戻る（' + joined.name + '）';
}
function getName(optional) {
  var n = cleanName($('nameIn').value);
  if (!n) { if (optional) return 'あなた'; toast('ニックネームを入力してください'); $('nameIn').focus(); return null; }
  store(LS_NAME, n); return n;
}
$('createBtn').onclick = function () { var n = getName(); if (n) { unlockAudio(); store(LS_HOST, null); startHost(n, null, false); } };
$('soloBtn').onclick = function () { var n = getName(true); unlockAudio(); store(LS_HOST, null); startHost(n, null, true); };
$('resumeBtn').onclick = function () {
  var saved = load(LS_HOST, true); if (!saved) return; unlockAudio();
  startHost(saved.room.seats[0].name, saved.room, saved.room.solo); host.resuming = true;
};
function join(code) {
  var n = getName(); if (!n) return;
  code = normCode(code);
  if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; }
  unlockAudio(); startClient(code, n);
}
$('joinBtn').onclick = function () { join($('codeIn').value); };
$('joinInvitedBtn').onclick = function () { join(Q.get('room')); };
$('rejoinBtn').onclick = function () { var j = sload(SS_CLIENT); if (j) { $('nameIn').value = j.name; unlockAudio(); startClient(j.code, j.name); } };
$('codeIn').addEventListener('input', function () { this.value = normCode(this.value); });
if (location.protocol === 'file:') setTimeout(function () { toast('ファイルを直接開いています。招待URLは公開URL（https）でのみ使えます。'); }, 500);
// ---- ページ全体の引っぱり（バウンス・プルで閉じる・プルで再読み込み）とピンチを止める ----
var touch0 = null;
document.addEventListener('touchstart', function (e) { if (e.touches.length === 1) touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
document.addEventListener('touchmove', function (e) {
  if (!e.cancelable) return;
  if (e.touches.length > 1) { e.preventDefault(); return; }
  if (!touch0) return;
  var t = e.touches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return;
  for (var el = e.target; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
    var cs = getComputedStyle(el);
    var canV = ay >= ax * 0.5 && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && ((dy > 0 && el.scrollTop > 0) || (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1));
    var canH = ax >= ay * 0.5 && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && ((dx > 0 && el.scrollLeft > 0) || (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1));
    if (canV || canH) return;
  }
  e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
// タイトルのカード
$('titleFan').innerHTML = cardHtml('ed2', 'guard') + cardHtml('ed2', 'baron') + '<span class="who">🐻<br>🐰</span>' + cardHtml('ed2', 'princess') + cardHtml('ed2', 'chan');
// テスト用：自動で出す（window.__ll.autoplay = true）
setInterval(function () {
  var v = lastView; if (!window.__ll.autoplay || !v || v.phase !== 'game' || !v.g || pending) return;
  var g = v.g; if (!myTurn(g)) return;
  if (g.need.k === 'chan') { act('chan', { keep: 0, order: g.hand.map(function (x, i) { return i; }).slice(1) }); return; }
  var acts = L.legalActions({ mode: g.mode, n: g.n, P: g.P }, g.me, g.hand).filter(function (a) { return g.hand[a.i] !== 'princess'; });
  var a = acts[0] || L.legalActions({ mode: g.mode, n: g.n, P: g.P }, g.me, g.hand)[0]; act('play', { i: a.i, t: a.t, g: a.g });
}, TURBO ? 80 : 450);
renderTitle();

// ---- ひろばの「みんなの部屋」：同じメンバーで自動入室＋ホストは「つぎのゲーム」 ----
if (PARTY) {
  FuuParty.init({ game: 'todoke-koibumi',
    isHost: function () { return !!host && !host.room.solo; },
    inGame: function () { var R = host && host.room; return !!R && ['lobby', 'end', 'over', 'result'].indexOf(R.phase) < 0 && !(R.G && (R.G.over || R.G.phase === 'end' || R.G.phase === 'over')); },
    broadcast: function (m) { if (host) Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send(m); } catch (e) {} }); } });
  FuuParty.status = function () { return host ? { host: 1, n: Object.keys(host.conns).filter(function (k) { return host.conns[k].open; }).length } : { host: 0, joined: !!(client && client.everJoined) }; };
  $('nameIn').value = cleanName(PARTY.name) || 'ななし';
  setTimeout(function () {
    if (PARTY.host) { store(LS_HOST, null); startHost(cleanName(PARTY.name) || 'ホスト', null, false); }
    else startClient(PARTY.code, cleanName(PARTY.name) || 'ななし');
  }, 50);
}
