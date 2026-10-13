/* とどけ！こいぶみ：共通の定数・小道具・汎用UI（ほかのスクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、山札・手札・進行・CPUの思考はホストだけが持ちます。
 * 参加者の端末には「その人が見てよい情報」だけが送られます（他人の手札・山札の並び・伏せ札は送らない）。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var L = window.LL;
var Q = new URLSearchParams(location.search);
var CFG = window.KR_CONFIG || window.SR_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'koibumi-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
var T = TURBO ? { cpu: [60, 120], off: 1200, roundEnd: 1500, awaken: 2500, k: 0.15 } : { cpu: [900, 1600], off: 9000, roundEnd: 12000, awaken: 7500, k: 1 };
var MAX_HUMANS = 6, HB_MS = 3000, LOST_MS = 10000;
var LV = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ😎' };
var LV_KEYS = ['weak', 'normal', 'strong', 'ultra'];
var CH = {}; window.LL_CHARS.forEach(function (c) { CH[c.id] = c; });
var CH_KEYS = window.LL_CHARS.map(function (c) { return c.id; });
var GAME_TITLE = 'とどけ！こいぶみ';
// 役（カード）の名前・絵・説明（すべてオリジナル）
var ROLE = {
  spy: { n: 'うわさ鳥', e: '🐦', c: '#5f7a8a', d: '出しても効果なし。ラウンドの終わりに、残っている人の中で うわさ鳥を出した（捨てた）人が<b>自分だけ</b>なら、こいぶみ💌を<b>1つ多く</b>もらえる。' },
  guard: { n: '門番', e: '🛡️', c: '#8d6e63', d: 'ほかの人を1人選び、<b>門番以外</b>の役を1つ言う。その人の手札と同じなら、その人は脱落。' },
  priest: { n: '吟遊詩人', e: '🎻', c: '#7e57c2', d: 'ほかの人を1人選び、その人の手札を<b>こっそり見る</b>。' },
  baron: { n: '剣士', e: '⚔️', c: '#c62828', d: 'ほかの人を1人選び、2人で手札を<b>こっそり比べる</b>。強さが小さい方が脱落（同じなら何もなし）。' },
  maid: { n: 'ばあや', e: '🧶', c: '#2e7d32', d: '次の自分の番まで、ほかの人のカードの効果を受けない（選ばれない）。' },
  prince: { n: '錬金術師', e: '⚗️', c: '#00838f', d: 'だれか1人（<b>自分もOK</b>）を選ぶ。その人は手札を捨てて（効果なし）1枚引き直す。山がなければ伏せ札を引く。<b>王女を捨てたら脱落</b>。' },
  chan: { n: '司書', e: '📜', c: '#6d4c41', d: '山から2枚引き、手札3枚から<b>1枚だけ残す</b>。残り2枚は好きな順番で山の<b>いちばん下</b>へ（山が1枚なら1枚引いて1枚戻す。山がなければ効果なし）。' },
  king: { n: '大公', e: '🎩', c: '#283593', d: 'ほかの人を1人選び、手札を<b>交換</b>する。' },
  countess: { n: '令嬢', e: '💃', c: '#ad1457', d: '出しても効果なし。ただし<b>大公か錬金術師と一緒</b>に持ったら、<b>必ず令嬢を出す</b>。' },
  minister: { n: '家令', e: '🗝️', c: '#455a64', d: '出しても効果なし。手札（2枚）の強さの<b>合計が12以上</b>になったら、あなたは脱落。' },
  princess: { n: '王女', e: '👸', c: '#c99a06', d: '出したり捨てたりしたら（理由は問わず）<b>脱落</b>。持っていれば いちばん強い。' }
};
var MODE_UI = {
  ed2: { n: '第2版ルール', s: '21枚・2〜6人・10種類', d: '世界で今いちばん遊ばれている第2版（2019年〜）のルール。うわさ鳥と司書が入ります。' },
  classic: { n: 'クラシック', s: '16枚・2〜4人・8種類', d: '第2版のルールブックにある「クラシック版」。第2版から門番1枚・司書2枚・うわさ鳥2枚を抜いた16枚で遊びます。' },
  kanai: { n: 'はじまりの16枚', s: '16枚・2〜4人・3点先取', d: 'いちばん最初の日本版（2012年の同人版／2014年の商業版）のルール。令嬢のかわりに「家令」。守られた人も選べる（効果なし）。強さ8の王女で勝つと2点。' }
};
function roleDesc(mode, r) {
  var d = ROLE[r].d;
  if (mode === 'kanai' && r === 'maid') d = '次の自分の番まで、自分へのカードの効果を<b>無効</b>にする（選ばれることはあるが、効果は起きない）。';
  if (mode === 'kanai' && r === 'prince') d = 'だれか1人（<b>自分もOK</b>）を選ぶ。その人は手札を捨てて（効果なし）1枚引き直す。山がなければ伏せ札を引く。<b>王女を捨てたら脱落</b>。';
  return d;
}
function rname(r) { return ROLE[r] ? ROLE[r].n : '?'; }
function rv(mode, r) { return L.MODES[mode].val[r]; }
var LS_ID = 'll-client-id', LS_NAME = 'll-name', LS_HOST = 'll-host-room', SS_CLIENT = 'll-joined', LS_SOUND = 'll-sound-off';
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
var PARTY = window.FuuParty && window.FuuParty.info;   // ひろばの「みんなの部屋」から来たとき
function genCode() { if (PARTY && PARTY.host) return PARTY.code; var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }

// ---------- カードの見た目（CSS＋絵文字。オリジナル） ----------
function cardHtml(mode, r, cls, attrs) {
  if (!r) return '<div class="cd back' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '><span class="crest">💌</span></div>';
  var o = ROLE[r];
  return '<div class="cd' + (cls ? ' ' + cls : '') + '" style="--rc:' + o.c + '"' + (attrs || '') + '><span class="v">' + rv(mode, r) + '</span><span class="em">' + o.e + '</span><span class="nm">' + o.n + '</span></div>';
}
function miniHtml(mode, r, cls) { var o = ROLE[r]; return '<span class="mini' + (cls ? ' ' + cls : '') + '" style="--rc:' + o.c + '" title="' + o.n + '"><b>' + rv(mode, r) + '</b>' + o.e + '</span>'; }
function chipHtml(mode, r) { var o = ROLE[r]; return '<span class="rchip" style="--rc:' + o.c + '">' + o.e + '<b>' + o.n + '</b><small>' + rv(mode, r) + '</small></span>'; }

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
// あそびかた（モードごと）
function rulesHtml(mode) {
  var M = L.MODES[mode], g = M.goal, gs = Object.keys(g).map(function (k) { return k + '人：' + g[k]; }).join('／');
  var li = [
    '<b>' + MODE_UI[mode].n + '</b>（' + MODE_UI[mode].s + '）。' + MODE_UI[mode].d,
    'お城の王女に こいぶみ💌 を届けよう。手札は<b>いつも1枚</b>。山からよく切って<b>1枚を伏せたまま除き</b>（2人のときは さらに<b>3枚を表向き</b>で除く）、1人1枚配ります。',
    '自分の番：山から<b>1枚引いて</b>、2枚のうち<b>1枚を出して</b>効果を使います。出したカードは全員に見えるので、だれが何を持っていそうか推理しよう。',
    'だれかを選ぶカードで、選べる人がいないとき（全員' + (M.protTarget ? '脱落など' : 'ばあやで守られている等') + '）は、効果なしで出せます。',
    'ラウンドの終わり：<b>山がなくなったら</b>、その番のあと残っている人が手札を見せて、<b>いちばん強い人</b>の勝ち（同点なら全員勝ち）。<b>1人だけ残った</b>ら、その人の勝ち。',
    '勝った人は こいぶみ💌 を1つ' + (M.bonus8 ? '（強さ8の王女で勝ったら<b>2つ</b>）' : '') + '。' + (M.spyBonus ? 'うわさ鳥のボーナスもあります。' : '') + '次のラウンドは勝った人から（同点なら勝った人の中からランダム）。',
    '目標の数に届いた人が優勝：' + gs + '。',
    '<b>カード（強さ・枚数・効果）</b><br>' + M.roles.slice().reverse().map(function (r) { return chipHtml(mode, r) + ' ×' + M.cnt[r] + '<br><span class="rd">' + roleDesc(mode, r) + '</span>'; }).join('<br>'),
    '空いた席はCPU（ふーさん🐻・ミミ🐰・ロボミ🤖・ニャコ😺・ポチ太🐶・コンタ🦊）。強さは 弱い／普通／強い／アストラウルトラ😎。CPUは<b>見えている情報だけ</b>で考えます（山札や他人の手札はのぞきません）。'
  ];
  return li.map(function (t) { return '<li>' + t + '</li>'; }).join('');
}
