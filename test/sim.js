// CPU同士の自己対戦で勝率を測る。 node test/sim.js [倍率]   （ジョブは並列の子プロセスで実行）
'use strict';
const L = require('../logic.js');
const { execFile } = require('child_process');
const MUL = +process.argv[2] || 1, BUDGET = 3000;
const JOBS = [];
const LVS = ['weak', 'normal', 'strong', 'ultra'];
for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) JOBS.push({ name: '2人 第2版 ' + LVS[a] + ' vs ' + LVS[b], mode: 'ed2', focal: LVS[b], other: LVS[a], np: 2, n: LVS[b] === 'ultra' ? 300 : 1000 });
JOBS.push({ name: '3人 第2版 ultra×1 vs strong×2', mode: 'ed2', focal: 'ultra', other: 'strong', np: 3, n: 240 });
JOBS.push({ name: '4人 第2版 ultra×1 vs strong×3', mode: 'ed2', focal: 'ultra', other: 'strong', np: 4, n: 240 });
JOBS.push({ name: '6人 第2版 ultra×1 vs strong×5', mode: 'ed2', focal: 'ultra', other: 'strong', np: 6, n: 160 });
JOBS.push({ name: '4人 クラシック ultra×1 vs strong×3', mode: 'classic', focal: 'ultra', other: 'strong', np: 4, n: 200 });
JOBS.push({ name: '2人 はじまり ultra vs strong', mode: 'kanai', focal: 'ultra', other: 'strong', np: 2, n: 300 });
JOBS.push({ name: '2人 はじまり strong vs normal', mode: 'kanai', focal: 'strong', other: 'normal', np: 2, n: 1000 });
JOBS.push({ name: '6人 第2版 混成 weak/normal/strong/ultra/normal/strong', mode: 'ed2', mixed: ['weak', 'normal', 'strong', 'ultra', 'normal', 'strong'], np: 6, n: 180 });

function run(j) {
  const n = Math.round(j.n * MUL), t0 = Date.now(), score = {}, cnt = {}, spy = { n: 0 };
  let rounds = 0;
  for (let i = 0; i < n; i++) {
    let lv;
    if (j.mixed) { const r = i % j.np; lv = j.mixed.map((_, q) => j.mixed[(q + r) % j.np]); }
    else { const seat = i % j.np; lv = Array.from({ length: j.np }, (_, q) => q === seat ? j.focal : j.other); }
    const S = L.simMatch(lv, L.mulberry(9000 + i * 7919), { mode: j.mode, start: Math.floor(i / j.np) % j.np, budget: BUDGET });
    lv.forEach((l, q) => { cnt[l] = (cnt[l] || 0) + 1; if (S.winners.includes(q)) score[l] = (score[l] || 0) + 1 / S.winners.length; });
    rounds += S.results.length; S.results.forEach(r => { if (r.spy != null) spy.n++; });
  }
  const out = {};
  for (const l in cnt) out[l] = { win: +(100 * (score[l] || 0) / n).toFixed(1), seats: cnt[l] / n };
  return { name: j.name, games: n, rate: out, fair: +(100 / j.np).toFixed(1), roundsPerGame: +(rounds / n).toFixed(2), spyBonusPerGame: +(spy.n / n).toFixed(2), sec: +((Date.now() - t0) / 1000).toFixed(1), msPerGame: Math.round((Date.now() - t0) / n) };
}
if (process.argv[3] != null) { process.stdout.write(JSON.stringify(run(JOBS[+process.argv[3]]))); return; }
const res = []; let next = 0, live = 0, cpus = Math.max(1, require('os').cpus().length - 1);
function pump() {
  while (live < cpus && next < JOBS.length) {
    const k = next++; live++;
    execFile(process.execPath, [__filename, String(MUL), String(k)], { maxBuffer: 1 << 24 }, (err, so) => {
      live--; if (err) { console.error(JOBS[k].name, err.message); process.exitCode = 1; } else { res[k] = JSON.parse(so); const r = res[k];
        console.log(r.name + '（' + r.games + '戦, ' + r.sec + '秒）: ' + Object.keys(r.rate).map(l => l + ' ' + r.rate[l].win + '%' + (r.rate[l].seats > 1 ? '(' + r.rate[l].seats + '席合計)' : '')).join(' / ') + '  均等=' + r.fair + '%  平均' + r.roundsPerGame + 'R'); }
      if (next < JOBS.length) pump(); else if (!live) require('fs').writeFileSync(__dirname + '/sim-report.json', JSON.stringify(res, null, 1));
    });
  }
}
pump();
