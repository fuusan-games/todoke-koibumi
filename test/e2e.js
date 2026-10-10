// E2E: とどけ！こいぶみ — ひとり用（390×844・アストラウルトラ）、375×667、ホスト＋参加者のオンライン（PeerJS＋ローカルSTUN）
// usage: node test/stun.js <box-ip> 3478 &  python3 -m http.server 8931 &  node test/e2e.js <box-ip> 8931
const { chromium } = require('/workspace/hayaoshi-quiz/node_modules/playwright-core');
const IP = process.argv[2] || '172.30.0.2', PORT = process.argv[3] || 8931;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__ll.view && JSON.parse(JSON.stringify(window.__ll.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__ll.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  const finishAnims = p => p.evaluate(() => document.getAnimations().forEach(a => { try { if (isFinite(a.effect.getComputedTiming().endTime)) a.finish(); } catch (e) {} }));
  async function layout(p, tag) {
    const r = await p.evaluate(() => {
      const vis = el => { if (!el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [];
      scr.querySelectorAll('button, input, select, a, .cd[data-i]').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight);
        if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
      });
      const inGame = document.body.classList.contains('in-game');
      const cards = [...document.querySelectorAll('#handArea .cd')].map(c => c.getBoundingClientRect());
      const wide = [...scr.querySelectorAll('*')].filter(e => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('#log') && !e.closest('.chips') && !e.closest('#pop') && !e.closest('.pd')).map(e => e.id || e.className).slice(0, 3);
      return { docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, scrollY, fab: !!fr, hits, inGame, wide,
        cardMinH: cards.length ? Math.min(...cards.map(c => c.height)) : 99, cardMaxBottom: cards.length ? Math.max(...cards.map(c => c.bottom)) : 0, vh: innerHeight };
    });
    if (r.docScroll > 1 || r.scrollY) fail(`[${tag}] page scrolls: ${JSON.stringify(r)}`);
    if (r.hits.length) fail(`[${tag}] hub button overlaps: ${r.hits.join(', ')}`);
    if (r.wide.length) fail(`[${tag}] elements overflow horizontally: ${r.wide.join(', ')}`);
    if (r.inGame) {
      if (r.fab) fail(`[${tag}] hub button visible during play`);
      if (r.cardMaxBottom > r.vh + 0.5 || r.cardMinH < 60) fail(`[${tag}] hand cards off-screen/small ${JSON.stringify(r)}`);
    }
    return r;
  }
  // 自分の番を本物のタップで進める（カード → 相手 → 役の予想 → 出す／司書の残す・戻す／結果のOK）
  async function humanTurns(p, who, n, shots) {
    let done = 0; const kinds = {};
    const t0 = Date.now();
    while (done < n && Date.now() - t0 < 150000) {
      const st = await p.waitForFunction(() => {
        const v = window.__ll.view; if (!v || v.phase !== 'game') return 'over';
        const act = id => document.getElementById(id).classList.contains('active');
        if (act('revealModal')) return 'reveal';
        if (act('roundModal')) return 'round';
        const g = v.g; if (!g.hand || !g.hand.length) return false; if (!g.need || g.need.p !== g.me || g.wait > 0 || g.phase !== 'play') return false;
        if (act('chanSheet')) return 'chan';
        if (act('playSheet')) return 'sheet';
        return document.querySelector('#handArea .cd[data-i]') ? 'turn' : false;
      }, null, { timeout: 90000, polling: 60 }).then(h => h.jsonValue(), async () => { const d = await p.evaluate(() => { const v = window.__ll.view, g = v.g; return JSON.stringify({ ph: v.phase, gp: g && g.phase, need: g && g.need, me: g && g.me, wait: g && g.wait, hand: g && g.hand, ov: [...document.querySelectorAll('.ov.active,.sheet.active')].map(e => e.id), cards: document.querySelectorAll('#handArea .cd').length, st: document.getElementById('status').textContent }); }); fail(`[${who}] stuck waiting for my turn: ${d}`); return 'over'; });
      if (st === 'over') break;
      if (st === 'reveal') { await sleep(150); if (shots && !kinds.reveal) await p.screenshot({ path: SS + shots + '_reveal.png' }); await p.tap('#rvOk'); kinds.reveal = 1; await sleep(100); continue; }
      if (st === 'round') { if (shots && !kinds.round) { await sleep(300); await p.screenshot({ path: SS + shots + '_round.png' }); } kinds.round = 1; if (await p.isVisible('#rdGo')) await p.tap('#rdGo', { timeout: 3000 }).catch(() => {}); else await p.tap('#rdClose', { timeout: 3000 }).catch(() => {}); await sleep(300); continue; }
      const k = await p.evaluate(() => window.__ll.view.g.k);
      if (st === 'chan') {
        await p.tap('#chanBox [data-ci="1"]'); await sleep(60);
        if (shots && !kinds.chan) await p.screenshot({ path: SS + shots + '_chancellor.png' });
        await p.tap('#chYes'); kinds.chan = 1;
      } else {
        if (st === 'turn') {
          const hand = await p.evaluate(() => window.__ll.view.g.hand);
          let i = hand.indexOf('guard'); if (i < 0) i = hand[0] === 'princess' ? 1 : hand.length > 1 && hand[1] !== 'princess' && Math.random() < 0.5 ? 1 : 0;
          await p.tap(`#handArea .cd[data-i="${i}"]`, { force: true }); await sleep(120);
        }
        if (!(await p.isVisible('#playSheet'))) { await sleep(200); continue; }   // 令嬢の強制などで出せないカードはヒントだけ
        const t = await p.$('#playBox [data-t]:not([data-t="' + (await p.evaluate(() => window.__ll.view.g.me)) + '"])') || await p.$('#playBox [data-t]');
        if (t) { await t.tap(); await sleep(60); }
        const gs = await p.$('#playBox [data-g]:not(.zero)') || await p.$('#playBox [data-g]');
        if (gs) { await gs.tap(); await sleep(60); kinds.guess = 1; }
        if (shots && !kinds.sheet && gs) { await finishAnims(p); await p.screenshot({ path: SS + shots + '_guard_sheet.png' }); kinds.sheet = 1; }
        if (await p.$('#plYes:disabled')) { fail(`[${who}] 出す stays disabled`); await p.tap('#plNo'); break; }
        await p.tap('#plYes'); kinds.play = 1;
        if (await p.isVisible('#confirmModal')) await p.tap('#cfYes');
      }
      await p.waitForFunction(k => { const v = window.__ll.view; return !v.g || v.g.k !== k; }, k, { timeout: 10000 }).catch(() => fail(`[${who}] tap had no effect (${st})`));
      done++;
    }
    ok(`[${who}] ${done} actions by real taps (${Object.keys(kinds).join('／')})`);
  }

  // ================= 1) ひとり用 390×844, ?from=portal, 6人・アストラウルトラ =================
  {
    const p = await phone('solo390');
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
    const L1 = await layout(p, 'title390');
    if (!L1.fab) fail('hub button should show on title with ?from=portal'); else ok('title: 🏠 ひろばへ visible with ?from=portal, no overlap, no page scroll');
    await p.screenshot({ path: SS + 'title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby390');
    await p.tap('#npSeg button[data-v="6"]');
    await waitV(p, 'v.opts.np === 6');
    const nCpu = await p.$$eval('#cpuList select[data-k="ch"]', s => s.length);
    if (nCpu !== 5) fail('6人 should give 5 CPU rows, got ' + nCpu); else ok('6人 → CPU 5人 (ふーさん・ミミ・ロボミ・ニャコ・ポチ太)');
    await p.selectOption('select[data-c="0"][data-k="ch"]', 'kon');   // コンタ と入れかえ
    await p.selectOption('select[data-c="0"][data-k="lv"]', 'ultra');
    await p.tap('#lvAllSeg button[data-v="strong"]'); await p.selectOption('select[data-c="2"][data-k="lv"]', 'ultra');
    await waitV(p, "v.opts.cpu[2].lv === 'ultra' && v.opts.cpu[0].ch === 'kon'");
    const chs = await p.evaluate(() => window.__ll.view.opts.cpu.slice(0, 5).map(c => c.ch));
    if (new Set(chs).size !== 5) fail('duplicate characters after swap ' + chs); else ok('character select swaps instead of duplicating: ' + chs.join(','));
    await p.screenshot({ path: SS + 'lobby_solo.png' });
    await p.tap('#startBtn');
    await p.waitForSelector('#awaken.on', { timeout: 5000 });
    const dur = await p.evaluate(() => Math.max.apply(null, document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#awaken')).map(x => x.effect.getComputedTiming().endTime)));
    await p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 4300; }));
    await sleep(200); await p.screenshot({ path: SS + 'awaken.png' });
    const aw = await p.evaluate(() => ({ txt: document.getElementById('awaken').textContent.replace(/\s+/g, ' ').slice(0, 60), parts: document.querySelectorAll('#awParts i').length, bgm: window.__ll.bgm() }));
    await p.evaluate(() => document.getAnimations().forEach(a => a.play()));
    if (!(dur > 5000 && dur < 9000)) fail('awakening length ' + dur); else ok(`覚醒 cinematic ${(dur / 1000).toFixed(1)}s, ${aw.parts} particles 「${aw.txt.trim()}」`);
    if (aw.bgm.cur) fail('BGM should wait for the cinematic');
    await p.tap('#awaken'); await sleep(200);
    if (await p.$('#awaken.on')) fail('tap did not skip the cinematic'); else ok('tap skips the cinematic');
    await waitV(p, 'v.g.wait === 0', 8000); await sleep(1500);
    const b = await p.evaluate(() => ({ s: window.__ll.bgm(), lv: window.__ll.bgmLevel() }));
    if (b.s.cur !== 'epic') fail('boss BGM not playing ' + JSON.stringify(b)); else ok(`boss BGM playing after awakening (level ${(+b.lv || 0).toFixed(3)})`);
    if (!(await p.$('.ultra[data-p]'))) fail('ultra row aura missing'); else ok('アストラウルトラ rows have the aura border');
    await layout(p, 'game390');
    await p.screenshot({ path: SS + 'game_6p.png' });
    await p.tap('#refBtn2');
    await sleep(200); if (!(await p.isVisible('#refModal'))) fail('card reference not reachable'); else { await p.screenshot({ path: SS + 'card_ref.png' }); ok('🃏 card reference sheet opens during play'); }
    await p.tap('#refClose');
    await humanTurns(p, 'solo390', 6, 'solo');
    await p.evaluate(() => window.__ll.cutin('門番 的中！', 'テスト', '🦊')); await sleep(150);
    if (!(await p.$('#cutin.on'))) fail('ultra cut-in not shown'); else ok('ultra cut-in renders');
    await sleep(1700);
    await p.evaluate(() => { window.__ll.autoplay = true; });
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {   // 結果のOKやラウンド結果も自動で閉じる
      const v = await view(p); if (v.phase === 'end') break;
      if (await p.isVisible('#revealModal')) await p.tap('#rvOk').catch(() => {});
      if (await p.isVisible('#roundModal') && await p.isVisible('#rdGo')) await p.tap('#rdGo').catch(() => {});
      await sleep(500);
    }
    const v = await view(p);
    if (v.phase !== 'end') fail('solo 390 game did not finish: ' + v.phase);
    else {
      ok(`solo 6-player game finished (${((Date.now() - t0) / 1000).toFixed(0)}s): rounds ${v.g.round}, tokens ${v.g.owners.map((o, i) => (o.e || '') + o.name + (o.lv ? '(' + o.lv + ')' : '') + ' ' + v.g.tok[i]).join(' / ')}, winners ${JSON.stringify(v.g.winners)}`);
      if (Math.max(...v.g.tok) < 3) fail('6p should end at 3 tokens');
      await sleep(400); await p.screenshot({ path: SS + 'result.png' }); await layout(p, 'result390');
      const fabEnd = await p.evaluate(() => getComputedStyle(document.getElementById('hirobaFab')).display !== 'none');
      if (!fabEnd) fail('hub button should return on the result screen'); else ok('hub button back on result screen');
    }
    await p.context().close();
  }

  // ================= 2) ひとり用 375×667（iPhone SE）、2人・クラシック／はじまり =================
  for (const mode of ['classic', 'kanai']) {
    const p = await phone('solo375-' + mode, 375, 667);
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(300);
    await layout(p, 'title375'); if (mode === 'classic') await p.screenshot({ path: SS + 'title_375.png' });
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await p.tap(`#modeSeg button[data-v="${mode}"]`); await p.tap('#npSeg button[data-v="2"]'); await p.tap('#lvAllSeg button[data-v="strong"]');
    await waitV(p, `v.opts.np === 2 && v.opts.mode === '${mode}'`);
    await layout(p, 'lobby375');
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0');
    if (await p.$('#awaken.on')) fail('cinematic should not play without アストラウルトラ');
    await layout(p, 'game375-' + mode);
    if (mode === 'kanai') await p.screenshot({ path: SS + 'game_375_kanai.png' });
    await p.tap('#menuBtn'); const hub = await p.isVisible('#menuHiroba'); await p.tap('#menuRules'); await sleep(150);
    if (!hub || !(await p.isVisible('#rulesModal'))) fail('⋯ menu: rules / ひろば not reachable'); else ok(`[${mode}] ⋯ menu has 🏠 ひろばへ and あそびかた during play`);
    if (mode === 'kanai') await p.screenshot({ path: SS + 'rules_375.png' });
    await p.tap('#rulesClose');
    await humanTurns(p, 'solo375-' + mode, 6, mode === 'classic' ? 'classic375' : null);
    await p.evaluate(() => { window.__ll.autoplay = true; });
    let sampled = 0; const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const v = await view(p); if (v.phase === 'end') break;
      if (await p.isVisible('#revealModal')) await p.tap('#rvOk').catch(() => {});
      if (await p.isVisible('#roundModal') && await p.isVisible('#rdGo')) await p.tap('#rdGo').catch(() => {});
      else if (v.phase === 'game' && sampled < 4) { await layout(p, 'game375-sample'); sampled++; }
      await sleep(700);
    }
    const v = await view(p);
    if (v.phase !== 'end') fail(`[${mode}] 375 game did not finish`);
    else ok(`[${mode}] 375×667 2-player game finished: tokens ${v.g.tok.join(' / ')} (goal ${v.g.goal}), rounds ${v.g.round}`);
    await p.context().close();
  }

  // ================= 3) オンライン：ホスト＋参加者 =================
  {
    const host = await phone('host'), guest = await phone('guest');
    await host.goto(NET); await host.fill('#nameIn', 'りょう'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    if (!/^[A-Z0-9]{4}$/.test(code)) fail('room could not be created (signaling blocked?)');
    else {
      ok('room created ' + code + ' (PeerJS cloud signaling)');
      if (!(await host.$('#qr svg, #qr canvas, #qr img'))) fail('QR code missing'); else ok('invite QR code shown');
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.seats.length === 2', 45000).then(() => ok('guest joined via invite URL (WebRTC data channel up)'), () => fail('guest could not join'));
      await host.tap('#npSeg button[data-v="3"]'); await waitV(host, 'v.opts.np === 3');
      await host.selectOption('select[data-c="0"][data-k="lv"]', 'ultra');
      await waitV(guest, "v.opts.np === 3 && v.opts.cpu[0].lv === 'ultra'");
      if (!/アストラウルトラ/.test(await guest.textContent('#cpuList'))) fail('guest lobby does not show CPU level'); else ok('guest lobby shows CPU = アストラウルトラ😎');
      await host.screenshot({ path: SS + 'lobby_online.png' });
      await host.tap('#startBtn');
      await guest.waitForSelector('#awaken.on', { timeout: 10000 }).then(() => ok('覚醒 cinematic plays on the guest too'), () => fail('no cinematic on guest'));
      await waitV(guest, 'v.phase === "game" && v.g.wait === 0', 15000);
      // 手札が漏れていない（参加者の画面のデータに他人の手札がない）
      const leak = await guest.evaluate(() => { const g = window.__ll.view.g; return { hands: g.P.some(P => 'hand' in P), pv: g.ev.some(e => 'pv' in e), json: JSON.stringify(g) }; });
      if (leak.hands || leak.pv) fail('guest view contains private data'); else ok('guest view carries no other hands / private payloads (hand field only for self)');
      await Promise.all([[guest, 'guest', 5, 'guest'], [host, 'host', 4, null]].map(async ([p, who, n, sh]) => { await humanTurns(p, who, n, sh); await p.evaluate(() => { window.__ll.autoplay = true; }); }));
      await host.evaluate(() => { window.__ll.autoplay = false; }); await guest.evaluate(() => { window.__ll.autoplay = false; });
      await sleep(800);
      const hv = await view(host), gv = await view(guest);
      if (JSON.stringify(hv.g.tok) !== JSON.stringify(gv.g.tok) || hv.g.round !== gv.g.round || hv.g.deckN !== gv.g.deckN) fail('host/guest out of sync'); else ok('host and guest views in sync (round, deck, tokens)');
      await guest.screenshot({ path: SS + 'online_guest.png' });
      // 順番でないときの操作は無視される
      await waitV(host, 'v.g.need && v.g.need.p !== 1 && v.g.phase === "play"', 30000).catch(() => {});
      const before = await view(host);
      if (before.g.need && before.g.need.p !== 1) {
        await guest.evaluate(() => window.__ll.act('play', { i: 0, t: 0, g: 'priest' })); await sleep(400);
        const after = await view(host);
        if (after.g.ev.some(e => e.id === before.g.k + 1 && e.k === 'play' && e.p === 1)) fail('out-of-turn action accepted'); else ok('out-of-turn action is ignored by the host');
      }
      await host.evaluate(() => { window.__ll.autoplay = true; }); await guest.evaluate(() => { window.__ll.autoplay = true; });
      const t0 = Date.now();
      while (Date.now() - t0 < 300000) {
        const v = await view(guest); if (v.phase === 'end') break;
        for (const p of [host, guest]) { if (await p.isVisible('#revealModal')) await p.tap('#rvOk').catch(() => {}); }
        if (await host.isVisible('#roundModal') && await host.isVisible('#rdGo')) await host.tap('#rdGo').catch(() => {});
        await sleep(600);
      }
      const ev = await view(guest), eh = await view(host);
      if (ev.phase !== 'end' || eh.phase !== 'end') fail('online game did not finish: ' + eh.phase + '/' + ev.phase);
      else {
        ok(`online game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: tokens ${eh.g.tok.join(' / ')}`);
        if (JSON.stringify(eh.g.tok) !== JSON.stringify(ev.g.tok)) fail('final tokens differ host/guest');
        await sleep(400); await guest.screenshot({ path: SS + 'result_online_guest.png' });
      }
      await host.evaluate(() => { window.__ll.autoplay = false; }); await guest.evaluate(() => { window.__ll.autoplay = false; });
      // 「ロビーに戻りたい」 → ホストが中断
      for (const p of [host, guest]) for (let i = 0; i < 6 && await p.isVisible('#revealModal'); i++) { await p.tap('#rvOk'); await sleep(250); }
      await host.tap('#againBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      const clear = async p => { for (let i = 0; i < 20; i++) { if (await p.$('#awaken.on')) await p.tap('#awaken').catch(() => {}); else break; await sleep(200); } };
      await clear(guest); await guest.tap('#menuBtn'); await guest.tap('#menuReq');
      await host.waitForSelector('#lobbyReqBar.show button[data-lr]:not([data-lr="no"])', { timeout: 10000 }); await clear(host);
      await host.tap('#lobbyReqBar button[data-lr]:not([data-lr="no"])'); await host.tap('#cfYes');
      await waitV(guest, 'v.phase === "lobby"').then(() => ok('ロビーに戻りたい → host 中断してロビーへ → both in lobby'), () => fail('abort to lobby failed'));
      // ゲーム中にニックネームで入り直す
      await host.tap('#startBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.phase === "game"', 45000).then(() => ok('guest reloaded and rejoined mid-game by nickname'), () => fail('rejoin failed'));
    }
  }
  await browser.close();
  console.log(errors.length ? `\nFAILED (${errors.length})` : '\nALL E2E CHECKS PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
