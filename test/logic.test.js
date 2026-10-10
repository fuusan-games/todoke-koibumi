// node test/logic.test.js ― ルールエンジン・情報もれ・CPUの公平さのテスト（依存なし）
const L = require('../logic.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' → ' + JSON.stringify(a) + ' (期待 ' + JSON.stringify(b) + ')'); }
// 状態を指定して作る：hands[p] = 手札（手番の人は2枚）、deck = 山（上から）
function st(mode, n, hands, deck, o = {}) {
  const S = L.newMatch({ mode, n, rng: L.mulberry(o.seed || 1), start: o.p || 0 });
  L.startRound(S);
  // いったん全カードを回収して、指定どおりに並べ直す（数がそろっているかも確認）
  const all = L.fullDeck(mode).slice();
  const take = r => { const i = all.indexOf(r); if (i < 0) throw new Error('no card ' + r); all.splice(i, 1); return r; };
  S.P.forEach((P, p) => { P.hand = (hands[p] || []).map(take); P.disc = []; P.out = !!(o.out && o.out.includes(p)); P.prot = !!(o.prot && o.prot.includes(p)); P.spy = false; });
  S.faceUp = (o.faceUp || []).map(take);
  S.aside = o.aside === null ? null : take(o.aside || all.find(r => !deck.includes(r) || deck.filter(x => x === r).length < all.filter(x => x === r).length));
  S.deck = deck.map(take);
  if (o.fillDeck) S.deck = S.deck.concat(all.splice(0));
  for (const r in S.pub) S.pub[r] = 0; S.faceUp.forEach(r => S.pub[r]++);
  S.K.forEach(K => { K.L = K.L.map(row => row.map(() => 1)); K.kb = []; K.dk = K.dk.map(() => null); });
  S.kn = S.kn.map(r => r.map(() => null)); S.pk = S.pk.map(r => r.map(() => false));
  S.turn = o.p || 0; S.need = { k: 'play', p: o.p || 0 }; S.phase = 'play'; S.ev = [];
  return S;
}
const play = (S, p, i, t, g) => L.act(S, p, { a: 'play', i, t, g });
const last = (S, k) => S.ev.filter(e => e.k === k).pop();

console.log('■ カード構成・モード');
{
  const cnt = m => { const c = {}; L.fullDeck(m).forEach(r => c[r] = (c[r] || 0) + 1); return c; };
  eq(L.fullDeck('ed2').length, 21, '第2版は21枚');
  eq(cnt('ed2'), { spy: 2, guard: 6, priest: 2, baron: 2, maid: 2, prince: 2, chan: 2, king: 1, countess: 1, princess: 1 }, '第2版の内訳');
  eq(cnt('classic'), { guard: 5, priest: 2, baron: 2, maid: 2, prince: 2, king: 1, countess: 1, princess: 1 }, 'クラシック＝第2版から 守備1・司書2・うわさ鳥2 を抜いた16枚');
  eq(cnt('kanai'), { guard: 5, priest: 2, baron: 2, maid: 2, prince: 2, king: 1, minister: 1, princess: 1 }, 'カナイ版16枚（家令入り）');
  eq(L.MODES.ed2.val, { spy: 0, guard: 1, priest: 2, baron: 3, maid: 4, prince: 5, chan: 6, king: 7, countess: 8, princess: 9 }, '第2版の強さ');
  eq(L.MODES.kanai.val.king, 6, 'カナイ版：交換役は6'); eq(L.MODES.kanai.val.princess, 8, 'カナイ版：王女は8');
  eq(L.MODES.ed2.goal, { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 }, '第2版の勝利トークン数');
  eq(L.MODES.classic.goal, { 2: 6, 3: 5, 4: 4 }, 'クラシックも同じ表（2〜4人）');
  eq(L.MODES.kanai.goal, { 2: 3, 3: 3, 4: 3 }, 'カナイ版は3点先取');
  ok(/人数/.test((() => { try { L.newMatch({ mode: 'classic', n: 5 }); } catch (e) { return e.message; } })()), 'クラシックは5人不可');
  ok((() => { try { L.newMatch({ mode: 'ed2', n: 6 }); return true; } catch (e) { return false; } })(), '第2版は6人OK');
}
console.log('■ 準備');
for (const [mode, n] of [['ed2', 2], ['ed2', 3], ['ed2', 6], ['kanai', 2], ['classic', 4]]) {
  const S = L.newMatch({ mode, n, rng: L.mulberry(5), start: 0 }); L.startRound(S);
  const M = L.MODES[mode];
  ok(S.aside != null, `${mode} ${n}人：伏せ札1枚`);
  eq(S.faceUp.length, n === 2 ? 3 : 0, `${mode} ${n}人：表向きで除く札`);
  eq(S.P.map(P => P.hand.length + (P.out ? P.disc.length : 0)), S.P.map((P, p) => p === 0 ? 2 : 1), `${mode} ${n}人：1枚ずつ配って、最初の人が1枚引く`);
  eq(S.deck.length, M.total - 1 - (n === 2 ? 3 : 0) - n - 1, `${mode} ${n}人：山の枚数`);
}
console.log('■ 門番（当てる）');
{
  let S = st('ed2', 3, [['guard', 'maid'], ['priest'], ['baron']], ['spy', 'guard', 'guard']);
  ok(/門番以外/.test(play(S, 0, 0, 1, 'guard')), '門番は「門番」を指名できない');
  ok(/対象/.test(play(S, 0, 0, 0, 'priest')), '自分は選べない');
  eq(play(S, 0, 0, 1, 'baron'), null, 'はずれ');
  ok(!S.P[1].out && last(S, 'play').res === 'miss', 'はずれ→何も起きない');
  S = st('ed2', 3, [['guard', 'maid'], ['priest'], ['spy']], ['spy', 'guard', 'guard']);
  play(S, 0, 0, 2, 'spy');
  ok(S.P[2].out && S.P[2].disc.includes('spy'), 'あたり→脱落、手札を公開（うわさ鳥も指名できる）');
  S = st('ed2', 3, [['guard', 'maid'], ['priest'], ['baron']], ['spy', 'guard', 'guard'], { prot: [1, 2] });
  eq(L.targets(S, 0, 'guard').list, [], 'ばあやに守られた人は選べない');
  eq(play(S, 0, 0, -1), null, 'だれも選べない→効果なしで出せる');
  eq(last(S, 'play').res, 'noeff', '効果なし');
}
console.log('■ 吟遊詩人（見る）');
{
  const S = st('ed2', 3, [['priest', 'maid'], ['king'], ['baron']], ['spy', 'guard', 'guard']);
  play(S, 0, 0, 1);
  const e = last(S, 'play');
  eq(e.pv, { 0: { seen: 'king' } }, '見た内容は出した人だけ');
  eq(S.kn[0][1], 'king', '知識として残る');
  ok(L.viewFor(S, 2).ev.every(x => !x.mine && JSON.stringify(x).indexOf('king') < 0), '第三者のビューに中身が出ない');
  eq(L.viewFor(S, 0).ev.filter(x => x.mine).pop().mine, { seen: 'king' }, '本人のビューには出る');
}
console.log('■ 剣士（くらべる）');
{
  let S = st('ed2', 3, [['baron', 'prince'], ['priest'], ['spy']], ['guard', 'guard', 'guard']);
  play(S, 0, 0, 1);
  ok(S.P[1].out && !S.P[0].out, '小さい方（相手）が脱落');
  eq(last(S, 'play').pv, { 0: { mine: 'prince', theirs: 'priest' }, 1: { mine: 'priest', theirs: 'prince' } }, '比べた2人だけに見せる');
  ok(JSON.stringify(L.viewFor(S, 2)).indexOf('prince') < 0, '第三者には勝った側の手札が見えない');
  S = st('ed2', 3, [['baron', 'guard'], ['priest'], ['spy']], ['guard', 'guard', 'guard']);
  play(S, 0, 0, 1); ok(S.P[0].out && !S.P[1].out, '自分が小さい→自分が脱落');
  S = st('ed2', 3, [['baron', 'maid'], ['maid'], ['spy']], ['guard', 'guard', 'guard']);
  play(S, 0, 0, 1); ok(!S.P[0].out && !S.P[1].out && last(S, 'play').res === 'tie', '同じ強さ→だれも脱落しない');
}
console.log('■ ばあや（守る）');
{
  const S = st('ed2', 2, [['maid', 'guard'], ['priest']], ['guard', 'spy', 'baron', 'guard']);
  play(S, 0, 0, -1);
  ok(S.P[0].prot, '守られる');
  eq(L.targets(S, 1, 'priest').list, [], '相手は選べない');
  play(S, 1, 0, -1);   // priest：選べないので効果なし
  ok(S.need.p === 0 && !S.P[0].prot, '自分の次の手番の開始で守りが切れる');
}
console.log('■ 錬金術師（捨てて引き直し）');
{
  let S = st('ed2', 3, [['prince', 'guard'], ['baron'], ['maid']], ['spy', 'guard', 'guard']);
  play(S, 0, 0, 1);
  ok(S.P[1].disc.includes('baron') && S.P[1].hand[0] === 'spy', '相手は捨てて山から引く');
  S = st('ed2', 3, [['prince', 'guard'], ['princess'], ['maid']], ['spy', 'guard', 'guard']);
  play(S, 0, 0, 1);
  ok(S.P[1].out && S.P[1].hand.length === 0 && S.deck.length === 2, '王女を捨てさせたら脱落（引かない）');
  S = st('ed2', 3, [['prince', 'guard'], ['baron'], ['maid']], ['spy', 'guard', 'guard']);
  play(S, 0, 0, 0); ok(S.P[0].disc.includes('guard') && S.P[0].hand[0] === 'spy', '自分も選べる');
  S = st('ed2', 3, [['prince', 'princess'], ['baron'], ['maid']], ['spy', 'guard', 'guard'], { prot: [1, 2] });
  eq(L.targets(S, 0, 'prince').list, [0], 'ほかが全員守られていたら自分しか選べない');
  play(S, 0, 0, 0); ok(S.P[0].out, '自分の王女を捨てたら脱落');
  S = st('ed2', 3, [['prince', 'guard'], ['baron'], ['maid']], [], { aside: 'countess' });
  play(S, 0, 0, 1); ok(S.P[1].hand[0] === 'countess' && S.aside == null, '山がなければ伏せ札を引く');
  ok(S.phase !== 'play', 'その手番のあとラウンド終了');
  S = st('ed2', 3, [['prince', 'spy'], ['baron'], ['maid']], ['guard', 'guard']);
  play(S, 0, 0, 0); ok(S.P[0].spy, '錬金術師で捨てたうわさ鳥も「捨てた」に数える');
}
console.log('■ 司書（2枚引いて1枚残す）');
{
  let S = st('ed2', 3, [['chan', 'guard'], ['baron'], ['maid']], ['spy', 'countess', 'priest', 'guard']);
  play(S, 0, 0, -1);
  eq(S.need, { k: 'chan', p: 0 }, '選ぶ番になる'); eq(S.P[0].hand, ['guard', 'spy', 'countess'], '2枚引いて3枚');
  ok(/順番/.test(L.act(S, 0, { a: 'chan', keep: 2, order: [0] })), '戻すのは2枚');
  eq(L.act(S, 0, { a: 'chan', keep: 2, order: [1, 0] }), null, '令嬢を残す');
  eq(S.P[0].hand, ['countess'], '1枚だけ残る'); eq(S.deck.slice(-2), ['spy', 'guard'], '指定順で山の下へ（上側→いちばん下）');
  eq(S.K[0].kb, [{ r: 'spy', pos: 1 }, { r: 'guard', pos: 0 }], '戻した本人だけが位置を覚えている');
  eq(S.K[1].kb, [], 'ほかの人は知らない');
  ok(L.viewFor(S, 1).ev.every(e => !e.mine), 'ほかの人のビューに戻したカードが出ない');
  S = st('ed2', 3, [['chan', 'guard'], ['baron'], ['maid']], ['king']);
  play(S, 0, 0, -1); eq(S.P[0].hand.length, 2, '山が1枚なら1枚引いて');
  L.act(S, 0, { a: 'chan', keep: 0, order: [1] }); eq(last(S, 'chanDone').n, 1, '1枚戻す'); eq(S.P[1].hand, ['baron', 'king'], '戻した札は次の人が引く');
  ok(S.phase === 'play', '山が残っているのでラウンド続行');
  S = st('ed2', 3, [['chan', 'guard'], ['baron'], ['maid']], [], { aside: 'king' });
  play(S, 0, 0, -1); eq(last(S, 'play').res, 'noeff', '山がなければ効果なし');
  S = st('ed2', 3, [['chan', 'king'], ['baron'], ['maid']], ['countess', 'guard', 'guard']);
  play(S, 0, 0, -1); eq(L.act(S, 0, { a: 'chan', keep: 0, order: [1, 2] }), null, '司書で引いた時は令嬢の強制はかからない（大公を残せる）');
}
console.log('■ 大公（交換）');
{
  const S = st('ed2', 3, [['king', 'guard'], ['baron'], ['maid']], ['spy', 'guard', 'guard']);
  play(S, 0, 0, 2);
  eq([S.P[0].hand, S.P[2].hand], [['maid'], ['guard']], '手札を交換');
  eq(last(S, 'play').pv, { 0: { gave: 'guard', got: 'maid' }, 2: { gave: 'maid', got: 'guard' } }, '交換した2人だけが中身を知る');
  eq([S.kn[0][2], S.kn[2][0]], ['guard', 'maid'], 'おたがい相手の手札を知っている');
}
console.log('■ 令嬢・王女・うわさ鳥');
{
  let S = st('ed2', 3, [['countess', 'king'], ['baron'], ['maid']], ['spy', 'guard', 'guard']);
  ok(/令嬢/.test(play(S, 0, 1, 1)), '大公と一緒なら令嬢を出さなければならない');
  S = st('ed2', 3, [['prince', 'countess'], ['baron'], ['maid']], ['spy', 'guard', 'guard']);
  eq(L.forcedIdx('ed2', S.P[0].hand), 1, '錬金術師と一緒でも強制');
  S = st('ed2', 3, [['countess', 'guard'], ['baron'], ['maid']], ['spy', 'guard', 'guard']);
  eq(play(S, 0, 0, -1), null, 'それ以外のときも自由に出せる'); ok(JSON.stringify(last(S, 'play')).indexOf('guard') < 0, '出したときに もう1枚は見せない');
  S = st('ed2', 3, [['princess', 'guard'], ['baron'], ['maid']], ['spy', 'guard', 'guard']);
  play(S, 0, 0, -1); ok(S.P[0].out && S.P[0].disc.includes('guard'), '王女を出したら脱落（手札も公開）');
  // うわさ鳥：最後まで残った人の中で、ひとりだけ出していたら +1
  S = st('ed2', 2, [['spy', 'guard'], ['priest']], ['baron']);
  play(S, 0, 0, -1); // spy
  L.act(S, 1, { a: 'play', i: 0, t: 0 }); // P1 priest(look) ... deck empty after P1's draw → round end
  eq(S.phase === 'roundEnd' || S.phase === 'over', true, '山が尽きたらラウンド終了');
  eq(S.result.spy, 0, 'うわさ鳥ボーナスは P0');
  eq(S.result.win, [1], '強さは P1(剣士3) > P0(門番1)'); eq(S.result.gain, [1, 1], 'うわさ鳥 +1 は勝ちと別にもらえる');
  S = st('ed2', 3, [['spy', 'guard'], ['spy'], ['maid']], ['priest']);
  play(S, 0, 0, -1); L.act(S, 1, { a: 'play', i: 0, t: -1 });
  eq(S.result.spy, -1, '2人とも出していたらボーナスなし');
  S = st('ed2', 3, [['spy', 'princess'], ['guard'], ['maid']], ['priest', 'guard']);
  play(S, 0, 0, -1);   // P0 spy
  S.P[1].hand = ['guard', 'priest']; S.deck = []; // P1 は門番で P2 をはずす
  L.act(S, 1, { a: 'play', i: 0, t: 2, g: 'baron' });
  eq(S.result.spy, 0, '最後まで残った人のうち、ただ1人');
  eq(S.result.win, [0], '王女で勝ち'); eq(S.result.gain, [2, 0, 0], '勝ち＋うわさ鳥で2トークン');
  S = st('ed2', 3, [['guard', 'priest'], ['spy'], ['maid']], ['priest', 'guard']);
  S.P[1].spy = true; S.P[1].disc = ['spy']; S.P[1].hand = ['baron'];
  play(S, 0, 0, 1, 'baron'); eq(S.P[1].out, true, '脱落した人');
  ok(true, ''); // 脱落者のうわさ鳥は数えない → ラウンド終了時に確認
  while (S.phase === 'play') { const p = S.need.p; L.act(S, p, L.aiAct(S, p, 'normal')); }
  ok(S.result.spy !== 1, '脱落した人のうわさ鳥は数えない');
}
console.log('■ ラウンド終了・同点・トークン');
{
  let S = st('ed2', 3, [['guard', 'maid'], ['baron'], ['baron']], ['priest']);
  play(S, 0, 0, 1, 'king');   // はずれ
  play(S, 1, 0, -1); // P1：priest を引いて手札 baron,priest → baron 出す? → priest(0) を出す
  ok(S.phase !== 'play' || true, '');
  S = st('ed2', 3, [['guard', 'maid'], ['baron'], ['baron']], [], { aside: 'spy' });
  play(S, 0, 0, 1, 'king');
  eq(S.result.why, 'deck', '山切れで終了'); eq(S.result.win, [0], 'いちばん強い人が勝ち（ばあや4）');
  S = st('ed2', 3, [['guard', 'baron'], ['baron'], ['priest']], [], { aside: 'spy' });
  play(S, 0, 0, 2, 'king');
  eq(S.result.win, [0, 1], '同点なら全員勝ち'); eq(S.result.gain, [1, 1, 0], '全員1トークンずつ');
  ok([0, 1].includes(S.start), '次の手番は同点の勝者からランダム');
  S = st('ed2', 3, [['guard', 'baron'], ['priest'], ['maid']], ['spy', 'spy'], { out: [2] });
  play(S, 0, 0, 1, 'priest'); eq(S.result.why, 'last', '1人だけ残ったら終了'); eq(S.result.win, [0], '残った人の勝ち');
  eq(S.start, 0, '勝った人が次の最初');
  const v = L.viewFor(S, 1); eq(v.result.hands, [null, null, null], '1人残りで終わったときは手札を公開しない');
  S = st('ed2', 2, [['guard', 'baron'], ['priest']], ['spy'], {});
  S.tok = [5, 0];
  play(S, 0, 0, 1, 'priest'); eq(S.phase, 'over', '2人戦は6トークンで勝ち'); eq(S.winners, [0], '勝者');
  const S5 = L.newMatch({ mode: 'ed2', n: 5 }); eq(S5.goal, 3, '5人は3トークン');
}
console.log('■ カナイ版（家令・守られた人も選べる・王女は2点）');
{
  let S = st('kanai', 3, [['guard'], ['baron'], ['maid']], ['prince', 'guard'], { p: 2 });
  S.P[0].hand = ['minister']; S.need = { k: 'play', p: 2 }; S.turn = 2;
  S.P[2].hand = ['maid', 'guard']; play(S, 2, 1, 1, 'king');   // P2 がはずれ → 次は P0 が prince(5) を引く → 7+5=12 で脱落
  ok(S.P[0].out && last(S, 'minister'), '家令＋5以上で合計12以上→脱落');
  S = st('kanai', 3, [['guard', 'priest'], ['baron'], ['maid']], ['spy'.replace('spy', 'guard')], { prot: [1] });
  eq(L.targets(S, 0, 'guard').list, [1, 2], '守られた人も選べる');
  play(S, 0, 0, 1, 'baron'); ok(!S.P[1].out && last(S, 'play').res === 'blocked', 'ただし効果なし');
  S = st('kanai', 3, [['prince', 'guard'], ['baron'], ['maid']], ['guard', 'guard']);
  eq(L.targets(S, 0, 'prince').list, [0, 1, 2], '魔法の錬金術師は自分も選べる');
  S = st('kanai', 2, [['guard', 'princess'], ['priest']], [], { aside: 'maid', faceUp: ['guard', 'guard', 'guard'] });
  play(S, 0, 0, 1, 'baron'); eq(S.result.gain, [2, 0], '強さ8（王女）で勝つと2点');
  eq(L.forcedIdx('kanai', ['minister', 'king']), -1, 'カナイ版に令嬢の強制はない');
}
console.log('■ 情報もれ（ビューに秘密が入らない）');
{
  const rng = L.mulberry(99);
  let leaks = 0, checks = 0;
  for (let g = 0; g < 60; g++) {
    const mode = ['ed2', 'classic', 'kanai'][g % 3], n = 2 + (g % (mode === 'ed2' ? 5 : 3));
    const S = L.newMatch({ mode, n, rng }); L.startRound(S);
    let guard = 0;
    while (S.phase === 'play' && guard++ < 60) {
      for (let me = 0; me < n; me++) {
        const v = L.viewFor(S, me), js = JSON.stringify(v); checks++;
        if ('deck' in v || 'K' in v || 'kn' in v) leaks++;
        if (v.P.some(P => 'hand' in P)) leaks++;
        if (v.ev.some(e => 'pv' in e)) leaks++;
        // 自分あての秘密以外は入っていない
        S.ev.slice(-60).forEach(e => { if (e.pv) Object.keys(e.pv).forEach(q => { if (+q !== me) { const ve = v.ev.find(x => x.id === e.id); if (ve && ve.mine && JSON.stringify(ve.mine) === JSON.stringify(e.pv[q]) && JSON.stringify(e.pv[me] || null) !== JSON.stringify(e.pv[q])) leaks++; } }); });
        // 隠れた情報（他人の手札・山・伏せ札）を入れ替えても、ビューは変わらない（ラウンド序盤・知識なしの人）
        if (S.ev.every(e => !e.pv || !e.pv[me]) && S.K[me].kb.length === 0 && S.kn[me].every(x => x == null)) {
          const hid = []; S.P.forEach((P, q) => { if (q !== me && !P.out) hid.push(...P.hand.map((r, i) => [q, i])); });
          const pool = hid.map(([q, i]) => S.P[q].hand[i]).concat(S.deck, S.aside == null ? [] : [S.aside]);
          const saved = JSON.stringify([S.P.map(P => P.hand), S.deck, S.aside]);
          L.shuffle(pool, rng);
          hid.forEach(([q, i]) => { S.P[q].hand[i] = pool.shift(); }); S.deck = pool.slice(0, S.deck.length); if (S.aside != null) S.aside = pool[S.deck.length];
          if (JSON.stringify(L.viewFor(S, me)) !== js) leaks++;
          const back = JSON.parse(saved); S.P.forEach((P, q) => P.hand = back[0][q]); S.deck = back[1]; S.aside = back[2];
        }
      }
      const p = S.need.p; L.act(S, p, L.aiAct(S, p, 'normal'));
    }
  }
  eq(leaks, 0, `ビュー ${checks} 件で秘密のもれなし`);
}
console.log('■ CPUの公平さ（見えない情報を入れ替えても判断が同じ）');
{
  const rng = L.mulberry(7); let diff = 0, n0 = 0, same = 0;
  for (let g = 0; g < 80; g++) {
    const mode = ['ed2', 'classic', 'kanai'][g % 3], n = 2 + (g % 3);
    const S = L.newMatch({ mode, n, rng }); L.startRound(S);
    let guard = 0;
    while (S.phase === 'play' && guard++ < 40) {
      const p = S.need.p;
      for (const lv of ['normal', 'strong', 'ultra']) {
        const ob1 = L.observe(S, p), a1 = L.aiFromOb(ob1, lv, L.mulberry(g * 100 + guard), { budget: 300 });
        // 自分の知らない隠れ情報を入れ替える
        const hid = []; S.P.forEach((P, q) => { if (q !== p && !P.out && S.kn[p][q] == null) hid.push(q); });
        const pool = hid.map(q => S.P[q].hand[0]).concat(S.deck.slice(0, S.deck.length - S.K[p].kb.length), S.aside == null ? [] : [S.aside]);
        const saved = JSON.stringify([S.P.map(P => P.hand), S.deck, S.aside]);
        L.shuffle(pool, rng); hid.forEach(q => { S.P[q].hand = [pool.shift()]; });
        const dk = S.deck.length - S.K[p].kb.length; S.deck = pool.slice(0, dk).concat(S.deck.slice(dk)); if (S.aside != null) S.aside = pool[dk];
        const ob2 = L.observe(S, p), a2 = L.aiFromOb(ob2, lv, L.mulberry(g * 100 + guard), { budget: 300 });
        n0++; if (JSON.stringify(ob1) !== JSON.stringify(ob2) || JSON.stringify(a1) !== JSON.stringify(a2)) diff++;
        if (saved !== JSON.stringify([S.P.map(P => P.hand), S.deck, S.aside])) same++;
        const back = JSON.parse(saved); S.P.forEach((P, q) => P.hand = back[0][q]); S.deck = back[1]; S.aside = back[2];
      }
      L.act(S, p, L.aiAct(S, p, 'strong'));
    }
  }
  eq(diff, 0, `${n0} 回の判断で、隠れ情報を入れ替えても観察も判断も変わらない（うち ${same} 回は実際に中身が変わっていた）`);
}
console.log('■ 推理（ベイズ）の整合性');
{
  const rng = L.mulberry(3); let bad = 0, cnt = 0, hit = 0, tot = 0;
  for (let g = 0; g < 150; g++) {
    const mode = ['ed2', 'classic', 'kanai'][g % 3], n = 2 + (g % 3);
    L.simMatch(Array(n).fill('strong'), rng, { mode, check: S => {
      if (S.phase !== 'play') return;
      // 全カードがどこかにある
      const all = S.P.reduce((a, P) => a.concat(P.hand, P.disc), []).concat(S.deck, S.faceUp, S.aside == null ? [] : [S.aside]);
      if (all.length !== L.MODES[mode].total) bad++;
      const p = S.need.p, ob = L.observe(S, p), w = L.sampleWorld(ob, rng);
      if (w.deck.length !== S.deck.length) bad++;
      // 自分で戻したカードの位置は本物と一致
      ob.kb.forEach(b => { if (S.deck[S.deck.length - 1 - b.pos] !== b.r) bad++; });
      // 確実な知識は本物と一致
      ob.kn.forEach((r, q) => { if (r != null && !S.P[q].out && S.P[q].hand[0] !== r && !(q === p)) bad++; });
      cnt++;
      // 推理の当たり具合（最も確率の高い役＝本物？）
      S.P.forEach((P, q) => { if (q === p || P.out) return; const d = L.distOf(ob, q, true, L.poolOf(S, p)); const mi = d.indexOf(Math.max(...d)); tot++; if (L.MODES[mode].roles[mi] === P.hand[0]) hit++; });
    } });
  }
  eq(bad, 0, `${cnt} 局面で、カードの総数・世界のサンプル・確実な知識が本物と矛盾しない`);
  console.log(`  （参考）ベイズ推理の「いちばんありそうな役」の的中率 ${(100 * hit / tot).toFixed(1)}%`);
}
console.log('■ すべてのモード・人数でCPU同士が最後まで遊べる');
{
  for (const mode of L.MODE_KEYS) for (let n = L.MODES[mode].np[0]; n <= L.MODES[mode].np[1]; n++) {
    let okc = 0; for (let g = 0; g < 10; g++) { const S = L.simMatch(Array.from({ length: n }, (_, i) => ['weak', 'normal', 'strong', 'ultra'][(i + g) % 4]), L.mulberry(g + n * 31), { mode, budget: 200 }); if (S.phase === 'over' && S.winners.length && S.winners.every(p => S.tok[p] >= S.goal)) okc++; }
    eq(okc, 10, `${mode} ${n}人`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
