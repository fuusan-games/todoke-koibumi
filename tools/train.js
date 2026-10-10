// 自己対戦で CPU を調整する。 node tools/train.js [iters=40] [games=1500]
// 1) 推理モデルの β（出したカードから手札を読む強さ）を、自己対戦の実際の手札に対する対数損失が最小になるように決める
// 2) 「強い」の評価の重み W を、自己対戦の勝率が上がる方向へ山登り（同じ乱数の対局どうしで比べる）
const fs = require('fs');
const L = require('../logic.js');
const ITERS = +(process.argv[2] || 40), G = +(process.argv[3] || 1500);
const log = []; const say = s => { console.log(s); log.push(s); };
// ---- 1) β の校正 ----
function logloss(beta, games) {
  L.BETA = beta; let ll = 0, n = 0, hit = 0;
  const rng = L.mulberry(11);
  for (let g = 0; g < games; g++) {
    const mode = ['ed2', 'ed2', 'classic', 'kanai'][g % 4], np = mode === 'ed2' ? 2 + (g % 5) : 2 + (g % 3);
    L.simMatch(Array(np).fill('strong'), rng, { mode, check: S => {
      if (S.phase !== 'play' || S.need.k !== 'play') return;
      const p = S.need.p, ob = L.observe(S, p), U = L.poolOf(S, p), M = L.MODES[mode];
      S.P.forEach((P, q) => { if (q === p || P.out || ob.kn[q] != null) return; const d = L.distOf(ob, q, true, U); const pr = d[M.ri[P.hand[0]]]; ll -= Math.log(Math.max(1e-6, pr)); n++; if (d.indexOf(Math.max(...d)) === M.ri[P.hand[0]]) hit++; });
    } });
  }
  return { ll: ll / n, hit: hit / n, n };
}
// 比較用：数えるだけ（ベイズなし）
{
  const rng = L.mulberry(11); let ll = 0, n = 0;
  for (let g = 0; g < 300; g++) { const mode = ['ed2', 'ed2', 'classic', 'kanai'][g % 4], np = mode === 'ed2' ? 2 + (g % 5) : 2 + (g % 3);
    L.simMatch(Array(np).fill('strong'), rng, { mode, check: S => { if (S.phase !== 'play' || S.need.k !== 'play') return; const p = S.need.p, ob = L.observe(S, p), U = L.poolOf(S, p), M = L.MODES[mode];
      S.P.forEach((P, q) => { if (q === p || P.out || ob.kn[q] != null) return; const d = L.distOf(ob, q, false, U); ll -= Math.log(Math.max(1e-6, d[M.ri[P.hand[0]]])); n++; }); } }); }
  say(`数えるだけの推理：対数損失 ${(ll / n).toFixed(4)}`);
}
let bestB = 0.55, bestLL = 1e9; const betaRes = {};
for (const b of [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0, 1.3]) { const r = logloss(b, 300); betaRes[b] = r; say(`β=${b}: 対数損失 ${r.ll.toFixed(4)}  最有力の的中率 ${(100 * r.hit).toFixed(1)}%  (${r.n}件)`); if (r.ll < bestLL) { bestLL = r.ll; bestB = b; } }
L.BETA = bestB; say(`→ β = ${bestB}`);
// ---- 2) 重みの山登り ----
function score(W, baseW, n, seed) {
  // 2人(第2版)・4人(第2版)・2人(カナイ版)・3人(クラシック) を混ぜる。候補は1席、残りは現在のベスト
  let win = 0, tot = 0;
  const setups = [['ed2', 2], ['ed2', 4], ['kanai', 2], ['classic', 3], ['ed2', 3]];
  for (let i = 0; i < n; i++) {
    const [mode, np] = setups[i % setups.length], seat = i % np;
    const lv = Array.from({ length: np }, (_, q) => (S, p) => L.aiAct(S, p, 'strong', { W: q === seat ? W : baseW }));
    const S = L.simMatch(lv, L.mulberry(seed + i), { mode, start: (i >> 3) % np });
    if (S.winners.includes(seat)) win += 1 / S.winners.length;
    tot += 1 / np;
  }
  return win / tot;   // 1.0 = 互角
}
let best = Object.assign({}, L.W0), rng = L.mulberry(2026);
const keys = ['kv', 'kp', 'ks', 'el', 'pr', 'bl', 'maid', 'ch', 'kg', 'kx', 'ps', 'pd', 'spy', 'mn', 'late'];
for (let it = 0; it < ITERS; it++) {
  const cand = Object.assign({}, best);
  const k1 = keys[Math.floor(rng() * keys.length)], k2 = keys[Math.floor(rng() * keys.length)];
  [k1, k2].forEach(k => { cand[k] = Math.max(0, +(cand[k] * (0.6 + rng() * 0.8) + (rng() - 0.5) * 0.1).toFixed(3)); });
  const s = score(cand, best, G, 5000 + it * 100000);
  if (s > 1.02) { const s2 = score(cand, best, G, 9000000 + it * 100000); if (s2 > 1.01) { best = cand; say(`it${it}: 採用 ${k1},${k2} 相対勝率 ${s.toFixed(3)} / 再確認 ${s2.toFixed(3)}`); continue; } }
  if (it % 5 === 0) say(`it${it}: ${k1},${k2} ${s.toFixed(3)}`);
}
// 学習前と学習後
const before = score(best, L.W0, 4000, 777000), b2 = score(L.W0, L.W0, 2000, 778000);
say(`学習後の重み vs 学習前（調整前の「強い」3人以上は他席）相対勝率 ${before.toFixed(3)}（自分同士の基準 ${b2.toFixed(3)}）`);
fs.writeFileSync(__dirname + '/../weights.js', '// 自己対戦で調整した「強い」の重みと推理モデルの β（tools/train.js が生成）\n(typeof window !== \'undefined\' ? window : globalThis).LL_WEIGHTS = ' + JSON.stringify(best) + ';\n(typeof window !== \'undefined\' ? window : globalThis).LL_BETA = ' + bestB + ';\n');
fs.writeFileSync(__dirname + '/train-report.json', JSON.stringify({ beta: bestB, betaRes, W: best, W0: L.W0, relWin: before, log }, null, 1));
fs.writeFileSync(__dirname + '/train.log', log.join('\n') + '\n');
