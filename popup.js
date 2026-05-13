const $ = (id) => document.getElementById(id);

let running = false;
let scanInterval = null;
let scanCount = 0;

// --- Persist settings ---
chrome.storage.local.get(['seatCount','zoneFilter','interval','consecutive','autoConfirm'], (s) => {
  if (s.seatCount  !== undefined) $('seatCount').value   = s.seatCount;
  if (s.zoneFilter !== undefined) $('zoneFilter').value  = s.zoneFilter;
  if (s.interval   !== undefined) $('interval').value    = s.interval;
  if (s.consecutive!== undefined) $('consecutive').checked = s.consecutive;
  if (s.autoConfirm!== undefined) $('autoConfirm').checked = s.autoConfirm;
});

function saveSettings() {
  chrome.storage.local.set({
    seatCount:   +$('seatCount').value,
    zoneFilter:  $('zoneFilter').value.trim(),
    interval:    +$('interval').value,
    consecutive: $('consecutive').checked,
    autoConfirm: $('autoConfirm').checked,
  });
}

// --- Log ---
function log(msg, cls = '') {
  const box = $('logBox');
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString('th-TH')}] ${msg}`;
  if (cls === 'ok')   line.style.color = '#4ade80';
  if (cls === 'err')  line.style.color = '#f87171';
  if (cls === 'warn') line.style.color = '#fbbf24';
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  if (box.children.length > 80) box.removeChild(box.children[0]);
}

function setStatus(text, cls = 'info') {
  const el = $('statusText');
  el.textContent = text;
  el.className = cls;
}

function setCounter(id, val) {
  if (val !== undefined && val !== null) $(id).textContent = val;
}

// --- Messages from content script ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS') {
    setStatus(msg.text, msg.cls || 'info');
    if (msg.logCls !== undefined) log(msg.text, msg.logCls);
    setCounter('cntFound',    msg.found);
    setCounter('cntSelected', msg.selected);
    setCounter('cntScans',    msg.scans);
  }
  if (msg.type === 'DONE') {
    stopBot();
    setStatus(msg.text, 'ok');
    log(msg.text, 'ok');
  }
  if (msg.type === 'ERROR') {
    setStatus(msg.text, 'err');
    log(msg.text, 'err');
  }
});

// --- Start ---
$('btnStart').addEventListener('click', async () => {
  saveSettings();

  const seatCount = +$('seatCount').value;
  if (seatCount < 1 || seatCount > 10) {
    setStatus('จำนวนที่นั่งต้องอยู่ระหว่าง 1–10', 'err');
    return;
  }

  const opts = {
    seatCount,
    zoneFilter:  $('zoneFilter').value.trim().toUpperCase(),
    interval:    Math.max(100, +$('interval').value),
    consecutive: $('consecutive').checked,
    autoConfirm: $('autoConfirm').checked,
  };

  scanCount = 0;
  setCounter('cntFound', 0);
  setCounter('cntSelected', 0);
  setCounter('cntScans', 0);
  $('logBox').innerHTML = '';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { setStatus('ไม่พบ tab ที่ใช้งานอยู่', 'err'); return; }

  running = true;
  $('btnStart').disabled = true;
  $('btnStop').disabled  = false;
  setStatus('กำลังสแกนหาที่นั่ง...', 'warn');

  const modeLabel = opts.consecutive ? 'ติดกัน' : 'ไม่ติดกัน';
  log(`เริ่ม — ${seatCount} ที่นั่ง (${modeLabel})` + (opts.zoneFilter ? ` โซน: ${opts.zoneFilter}` : ''));

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  }).catch(() => {});

  chrome.tabs.sendMessage(tab.id, { type: 'START', opts });

  scanInterval = setInterval(() => {
    if (!running) { clearInterval(scanInterval); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'PING' }).catch(() => {});
  }, opts.interval);
});

// --- Stop ---
$('btnStop').addEventListener('click', stopBot);

async function stopBot() {
  running = false;
  clearInterval(scanInterval);
  $('btnStart').disabled = false;
  $('btnStop').disabled  = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'STOP' }).catch(() => {});

  setStatus('หยุดการสแกนแล้ว', 'info');
  log('หยุด');
}
