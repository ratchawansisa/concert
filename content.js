/* Concert Auto Booker — Content Script */

(function () {
  if (window.__concertBotActive !== undefined) {
    // Already injected — just reset state so START message can restart it
    window.__concertBotActive = false;
  }
  window.__concertBotActive = false;

  let scanTimer = null;
  let scanCount = 0;
  let opts = {};

  // ── Helpers ───────────────────────────────────────────────────────────────

  function send(payload) {
    try { chrome.runtime.sendMessage(payload); } catch (_) {}
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function doClick(el) {
    try { el.click(); } catch (_) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }

  // ── Seat parsing ──────────────────────────────────────────────────────────

  /**
   * Parse a seat element into { row, num, el }.
   * data-seat format: "B-77-P*4500"  →  row="B", num=77
   * Fallback: id="checkseat-B-77"   →  row="B", num=77
   */
  function parseSeat(el) {
    const raw = el.dataset.seat || el.id || '';
    // Match pattern like "B-77" anywhere in the string
    const m = raw.match(/([A-Za-z]+)-(\d+)/);
    if (!m) return null;
    return { row: m[1].toUpperCase(), num: parseInt(m[2], 10), el };
  }

  // ── Seat discovery ────────────────────────────────────────────────────────

  function getAvailable() {
    const all = Array.from(document.querySelectorAll('div.seatuncheck'));
    const zones = opts.zoneFilter
      ? opts.zoneFilter.split(',').map((z) => z.trim()).filter(Boolean)
      : [];

    return all
      .filter((el) => {
        if (!zones.length) return true;
        const seat = el.dataset.seat || el.id || '';
        return zones.some((z) => seat.toUpperCase().startsWith(z));
      })
      .map(parseSeat)
      .filter(Boolean);
  }

  // ── Mode 1: Any N seats (no adjacency requirement) ────────────────────────

  function findAnyN(seats, n) {
    return seats.length >= n ? seats.slice(0, n) : null;
  }

  // ── Mode 2: N consecutive seats in the same row ───────────────────────────

  function findConsecutiveN(seats, n) {
    if (n === 1) return seats.length ? [seats[0]] : null;

    // Group by row
    const byRow = {};
    for (const s of seats) {
      if (!byRow[s.row]) byRow[s.row] = [];
      byRow[s.row].push(s);
    }

    for (const row of Object.keys(byRow)) {
      // Sort by seat number within the row
      const sorted = byRow[row].slice().sort((a, b) => a.num - b.num);

      // Sliding window: find first run of N with no gaps
      let run = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].num === run[run.length - 1].num + 1) {
          run.push(sorted[i]);
          if (run.length === n) return run;
        } else {
          run = [sorted[i]];
        }
      }
    }
    return null;
  }

  // ── Confirm booking ───────────────────────────────────────────────────────

  async function confirm(seatLabels) {
    if (!opts.autoConfirm) {
      send({ type: 'DONE', text: `เลือก ${seatLabels} แล้ว — รอยืนยันด้วยตนเอง` });
      stopBot();
      return;
    }

    const btn = document.getElementById('bookmnow')
              || document.querySelector('.btn-main-action')
              || document.querySelector('a[id*="book"], button[id*="book"], a[id*="confirm"]');

    if (!btn) {
      send({ type: 'ERROR', text: 'ไม่พบปุ่มยืนยัน — กรุณากดเองที่หน้าเว็บ' });
      stopBot();
      return;
    }

    send({ type: 'STATUS', text: 'กดปุ่ม "ยืนยันที่นั่ง"...', cls: 'warn', logCls: 'warn' });
    await sleep(200);
    doClick(btn);

    send({ type: 'DONE', text: `จองสำเร็จ! ${seatLabels} — ยืนยันแล้ว` });
    stopBot();
  }

  // ── Main scan loop ────────────────────────────────────────────────────────

  async function scan() {
    if (!window.__concertBotActive) return;

    scanCount++;
    const available = getAvailable();

    send({
      type: 'STATUS', text: `รอบ ${scanCount}: พบที่ว่าง ${available.length} ที่`,
      cls: 'warn', logCls: '', found: available.length, scans: scanCount,
    });

    const group = opts.consecutive
      ? findConsecutiveN(available, opts.seatCount)
      : findAnyN(available, opts.seatCount);

    if (!group) {
      const reason = opts.consecutive
        ? `ยังไม่มี ${opts.seatCount} ที่ติดกัน — รอ...`
        : `ยังไม่มีที่ว่างเพียงพอ (${available.length}/${opts.seatCount}) — รอ...`;
      send({ type: 'STATUS', text: `รอบ ${scanCount}: ${reason}`, cls: 'warn', logCls: 'warn', scans: scanCount });
      scanTimer = setTimeout(scan, opts.interval);
      return;
    }

    // Click all seats in the group
    const labels = [];
    for (const s of group) {
      if (!window.__concertBotActive) return;
      const label = s.el.dataset.seat || s.el.id || `${s.row}-${s.num}`;
      labels.push(`${s.row}-${s.num}`);
      doClick(s.el);
      send({ type: 'STATUS', text: `คลิก: ${label}`, cls: 'ok', logCls: 'ok', selected: labels.length, scans: scanCount });
      await sleep(150);
    }

    await sleep(300);
    await confirm(labels.join(', '));
  }

  function stopBot() {
    window.__concertBotActive = false;
    clearTimeout(scanTimer);
  }

  // ── Message listener ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'START') {
      opts = msg.opts;
      scanCount = 0;
      clearTimeout(scanTimer);
      window.__concertBotActive = true;
      scan();
      sendResponse({ ok: true });
    }
    if (msg.type === 'STOP') {
      stopBot();
      sendResponse({ ok: true });
    }
    if (msg.type === 'PING') {
      sendResponse({ running: window.__concertBotActive });
    }
    return true;
  });
})();
