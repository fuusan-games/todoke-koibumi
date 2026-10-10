/* とどけ！こいぶみ：効果音（Web Audio で合成。外部音源なし） */
'use strict';
var audioCtx = null, sfxOut = null;
function unlockAudio() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!audioCtx) { audioCtx = new AC(); audioCtx.onstatechange = function () { BGM.sync(); }; }
    if (audioCtx.state === 'suspended') audioCtx.resume().then(function () { BGM.sync(); }, function () {}); else BGM.sync();
  } catch (e) {}
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });
function noiseSrc(a, sec) { var len = Math.floor(a.sampleRate * sec), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; var n = a.createBufferSource(); n.buffer = buf; return n; }
function env(g, at, peak, atk, rel) { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + atk); g.gain.exponentialRampToValueAtTime(0.0001, at + atk + rel); }
function thunderAt(a, out, at, vol) {   // 雷：パリッ＋ゴロゴロ
  var n = noiseSrc(a, 1.4), hp = a.createBiquadFilter(), g = a.createGain(); hp.type = 'highpass'; hp.frequency.value = 1800; env(g, at, vol * 0.8, 0.005, 0.25); n.connect(hp); hp.connect(g); g.connect(out); n.start(at); n.stop(at + 0.4);
  var r = noiseSrc(a, 1.6), lp = a.createBiquadFilter(), rg = a.createGain(); lp.type = 'lowpass'; lp.frequency.value = 260; env(rg, at + 0.05, vol, 0.08, 1.3); r.connect(lp); lp.connect(rg); rg.connect(out); r.start(at + 0.05); r.stop(at + 1.6);
}
var sfx = (function () {
  function ctx() { var a = audioCtx; return a && a.state === 'running' && !soundOff ? a : null; }
  function out(a, v) { var g = a.createGain(); g.gain.value = v; g.connect(a.destination); return g; }
  function tone(a, o, f, at, dur, type, vol) { var x = a.createOscillator(), g = a.createGain(); x.type = type || 'sine'; x.frequency.value = f; env(g, at, vol, 0.008, dur); x.connect(g); g.connect(o); x.start(at); x.stop(at + dur + 0.05); return x; }
  return {
    card: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.35), n = noiseSrc(a, 0.18), bp = a.createBiquadFilter(), g = a.createGain(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(4200, t + 0.12); env(g, t, 0.6, 0.01, 0.13); n.connect(bp); bp.connect(g); g.connect(o); n.start(t); n.stop(t + 0.18); tone(a, o, 1400, t + 0.1, 0.06, 'triangle', 0.2); },
    bust: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.35), x = a.createOscillator(), g = a.createGain(); x.type = 'sawtooth'; x.frequency.setValueAtTime(380, t); x.frequency.exponentialRampToValueAtTime(70, t + 0.6); env(g, t, 0.5, 0.01, 0.6); x.connect(g); g.connect(o); x.start(t); x.stop(t + 0.7); tone(a, o, 120, t, 0.35, 'square', 0.15); },
    safe: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); tone(a, o, 784, t, 0.25, 'triangle', 0.4); tone(a, o, 1175, t + 0.12, 0.4, 'triangle', 0.4); },
    turn: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.2); tone(a, o, 988, t, 0.18, 'sine', 0.35); tone(a, o, 1318, t + 0.1, 0.25, 'sine', 0.3); },
    dice: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); for (var i = 0; i < 7; i++) { var at = t + i * 0.075 + Math.random() * 0.02, n = noiseSrc(a, 0.05), bp = a.createBiquadFilter(), g = a.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 1800; bp.Q.value = 3; env(g, at, 0.5 - i * 0.05, 0.003, 0.04); n.connect(bp); bp.connect(g); g.connect(o); n.start(at); n.stop(at + 0.06); } tone(a, o, 330, t + 0.56, 0.08, 'triangle', 0.25); },
    win: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(a, o, f, t + i * 0.09, 0.35, 'triangle', 0.35); tone(a, o, f * 2, t + i * 0.09, 0.2, 'sine', 0.08); }); tone(a, o, 1046, t + 0.5, 0.9, 'sawtooth', 0.08); },
    thunder: function () { var a = ctx(); if (!a) return; var o = out(a, 0.45); thunderAt(a, o, a.currentTime + 0.01, 0.6); }
  };
})();
function setSound(off) {
  soundOff = off; store(LS_SOUND, off ? '1' : null);
  if (off && sfxOut) { try { sfxOut.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05); } catch (e) {} }
  if (!off) unlockAudio();
  BGM.sync(); soundUi();
}
function soundUi() { $('soundBtn').textContent = soundOff ? '🔇' : '🔊'; $('soundBtn').setAttribute('aria-label', soundOff ? '音をオンにする' : '音をオフにする'); $('menuSound').textContent = soundOff ? '🔇 BGM・効果音：オフ' : '🔊 BGM・効果音：オン'; }
$('soundBtn').onclick = function () { setSound(!soundOff); toast(soundOff ? '🔇 音をオフにしました' : '🔊 音をオンにしました'); };
$('menuSound').onclick = function () { setSound(!soundOff); };
soundUi();
