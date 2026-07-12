// comms — pictochat prototype
//
// drawings are stored as STROKE DATA (vector), not rasterized images.
// each stroke = { c: color, s: size, p: [[x,y], ...] } in CSS pixels.
// massively lighter than PNGs, crisp at any size, serializes easily for P2P.

// ESM imports (this script is loaded with type="module").
// Trystero (Nostr strategy) is VENDORED locally in ./vendor — no runtime CDN
// dependency, so the app always loads even if a CDN is down/blocked, and
// there's no third-party supply-chain surface. Nostr relays themselves are
// real-time event streams: sub-second peer discovery and fast reconnect.
import { joinRoom } from './vendor/trystero-nostr.js';

// Debug logging is opt-in via ?debug — keeps the public IP, room key, and
// other internals out of the console for everyone else (privacy hygiene).
const DEBUG = new URLSearchParams(location.search).has('debug');
const log = (...a) => { if (DEBUG) console.log('[comms]', ...a); };

// ------- Config -------
const COLORS = [
  '#000000', '#7F7F7F', '#880015', '#ED1C24',
  '#FF7F27', '#FFF200', '#22B14C', '#00A2E8',
  '#3F48CC', '#A349A4', '#FFFFFF', '#C3C3C3',
  '#B97A57', '#FFAEC9', '#FFC90E', '#B5E61D',
];
const MAX_MESSAGES   = 100;
const DRAG_THRESHOLD = 5;

// ------- Refs -------
const composeArea  = document.querySelector('.compose-area');
const canvas       = document.getElementById('composeCanvas');
const ctx          = canvas.getContext('2d');
const messageInput = document.getElementById('messageInput');
const messageLog   = document.getElementById('messageLog');
const usernameInput= document.getElementById('username');
const paletteEl    = document.getElementById('palette');

// ------- Compose canvas backing-store sizing -------
const dpr = window.devicePixelRatio || 1;
function sizeCanvas() {
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  canvas.width  = Math.max(1, Math.round(r.width  * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  ctx.scale(dpr, dpr);
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  // Replay current strokes onto the resized canvas so in-progress
  // drawings survive a window resize.
  for (const s of messageStrokes) drawStroke(ctx, s);
}
let resizeRaf;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(sizeCanvas);
});

// ------- Persistence (localStorage) -------
const STORE = {
  size:  'comms.pen.size',
  color: 'comms.pen.color',
  name:  'comms.name',
};
function storeGet(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

// Restore display name
const savedName = storeGet(STORE.name, '');
if (savedName) usernameInput.value = savedName;
usernameInput.addEventListener('input', () => storeSet(STORE.name, usernameInput.value));

// ------- Drawing state -------
let currentSize    = parseInt(storeGet(STORE.size, '4'), 10);
if (![2, 4, 8].includes(currentSize)) currentSize = 4;
let currentColor   = storeGet(STORE.color, '#000000');
if (!COLORS.includes(currentColor)) currentColor = '#000000';
let downStart      = null;
let drawing        = false;
let currentStroke  = null;        // active stroke being recorded
let messageStrokes = [];          // committed strokes for the current message

// ------- Palette UI -------
COLORS.forEach((color) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'color-swatch' + (color === currentColor ? ' active' : '');
  btn.style.background = color;
  btn.dataset.color = color;
  btn.title = color;
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = color;
    storeSet(STORE.color, color);
  });
  paletteEl.appendChild(btn);
});

// ------- Size buttons -------
// Sync the active state to the persisted size (HTML defaults to size 4).
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.classList.toggle('active', parseInt(btn.dataset.size, 10) === currentSize);
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = parseInt(btn.dataset.size, 10);
    storeSet(STORE.size, String(currentSize));
  });
});

// ------- Clear -------
document.getElementById('clearBtn').addEventListener('click', () => {
  clearDrawing();
  messageInput.focus();
});

// ------- Pointer logic: drag = draw, click = focus -------
function localPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  // preventDefault stops the press from blurring the textarea, so typing
  // continues to route there while the user is dragging to draw.
  e.preventDefault();
  downStart = { clientX: e.clientX, clientY: e.clientY };
  drawing = false;
  currentStroke = null;
  canvas.setPointerCapture(e.pointerId);
  if (document.activeElement !== usernameInput) {
    messageInput.focus();
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!downStart) return;
  if (!drawing) {
    const dx = e.clientX - downStart.clientX;
    const dy = e.clientY - downStart.clientY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drawing = true;
    const r = canvas.getBoundingClientRect();
    const startX = downStart.clientX - r.left;
    const startY = downStart.clientY - r.top;
    currentStroke = { c: currentColor, s: currentSize, p: [[startX, startY]] };
    // dot at start so a quick flick still marks
    ctx.beginPath();
    ctx.arc(startX, startY, currentSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = currentColor;
    ctx.fill();
  }
  const p = localPos(e);
  const last = currentStroke.p[currentStroke.p.length - 1];
  ctx.beginPath();
  ctx.moveTo(last[0], last[1]);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = currentStroke.c;
  ctx.lineWidth   = currentStroke.s;
  ctx.stroke();
  currentStroke.p.push([p.x, p.y]);
});

canvas.addEventListener('pointerup', () => {
  if (drawing && currentStroke) messageStrokes.push(currentStroke);
  messageInput.focus();
  downStart     = null;
  drawing       = false;
  currentStroke = null;
});

canvas.addEventListener('pointercancel', () => {
  downStart = null;
  drawing = false;
  currentStroke = null;
});

// ------- Send -------
document.getElementById('sendBtn').addEventListener('click', send);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

function send() {
  const text = messageInput.value.trim();
  const drew = messageStrokes.length > 0;
  if (!text && !drew) {
    flashCompose();
    return;
  }
  const name = (usernameInput.value || '').trim() || 'anon';

  // Capture the input field's dimensions at send time. Used both to render
  // the strokes proportionally AND to enforce min-height on every message
  // bubble so it matches the input field's aspect — no cropping, no shrinking.
  const r = canvas.getBoundingClientRect();
  const fieldW = r.width;
  const fieldH = r.height;
  const drawing = drew
    ? { strokes: messageStrokes.slice(), w: fieldW, h: fieldH }
    : null;

  appendMessage(name, text, drawing, fieldW, fieldH, true);

  // Broadcast to peers. Network failures are silent — your own message
  // already shows up locally regardless of whether it reached anyone.
  if (broadcastMessage) {
    try {
      broadcastMessage({ name, text, drawing, fieldW, fieldH });
    } catch (err) {
      console.warn('[comms] broadcast failed:', err);
    }
  }

  messageInput.value = '';
  clearDrawing();
  messageInput.focus();
}

function clearDrawing() {
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  messageStrokes = [];
  currentStroke = null;
}

// Re-render every committed stroke onto the compose canvas. Used by undo.
function redrawAllStrokes() {
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  for (const s of messageStrokes) drawStroke(ctx, s);
}

// Undo (Cmd/Ctrl+Z): pop the most recent stroke, re-render. Falls through to
// the textarea's native undo when there are no strokes left to remove.
window.addEventListener('keydown', (e) => {
  if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
    if (messageStrokes.length > 0) {
      e.preventDefault();
      messageStrokes.pop();
      redrawAllStrokes();
    }
  }
});

function flashCompose() {
  composeArea.classList.add('compose-area--flash');
  setTimeout(() => composeArea.classList.remove('compose-area--flash'), 240);
}

// ------- Append a message -------
// Each message stores its own data on its DOM node so the slideshow / flipnote
// playback feature can replay later messages inside an earlier message's bubble.
function appendMessage(name, text, drawing, fieldW, fieldH, isMe) {
  const data = { name, text, drawing, fieldW, fieldH, isMe, time: formatTime() };

  const msg = document.createElement('div');
  msg.className = 'message' + (isMe ? ' me' : '');
  msg._data = data;

  const header = document.createElement('div');
  header.className = 'message-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'message-name';
  const timeEl = document.createElement('span');
  timeEl.className = 'message-time';
  header.appendChild(nameEl);
  header.appendChild(timeEl);
  msg.appendChild(header);

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  // Lock every bubble to the input field's aspect ratio at send time.
  // Clamp the height to at most the width: a hostile peer could otherwise
  // send degenerate dims (e.g. 1×4096) that blow the bubble up to millions
  // of pixels tall. Legit messages are ~480×90 (wide), so this never bites.
  const safeH = Math.min(fieldH, fieldW);
  bubble.style.aspectRatio = `${fieldW} / ${safeH}`;

  // Play button — persists across slideshow frame swaps so its handler stays bound.
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'message-play';
  playBtn.title = 'play forward (flipnote-style)';
  playBtn.textContent = '▶';
  playBtn.addEventListener('click', () => playFollowups(msg));
  bubble.appendChild(playBtn);

  msg.appendChild(bubble);

  renderHeader(header, data);
  renderBubble(bubble, data);

  // Only auto-scroll if the user was already pinned to the bottom. This way
  // someone reading older messages — even if they're the sender themselves —
  // won't get yanked back down. They use the ▼ button when they're ready.
  const wasAtBottom = isAtBottom(messageLog);

  messageLog.appendChild(msg);

  if (wasAtBottom) {
    messageLog.scrollTop = messageLog.scrollHeight;
    // Re-pin after async stroke painting may have grown the layout
    requestAnimationFrame(() => requestAnimationFrame(() => {
      messageLog.scrollTop = messageLog.scrollHeight;
    }));
  }

  while (messageLog.children.length > MAX_MESSAGES) {
    messageLog.removeChild(messageLog.firstChild);
  }
}

// True if the message log is scrolled to (or within a few pixels of) bottom.
function isAtBottom(el, threshold = 6) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

// ▼ button — manual scroll to bottom
document.getElementById('scrollBottomBtn').addEventListener('click', () => {
  messageLog.scrollTop = messageLog.scrollHeight;
});

// Update only the header content. Used for both initial render and slideshow.
function renderHeader(header, data) {
  header.querySelector('.message-name').textContent = data.name;
  header.querySelector('.message-time').textContent = data.time;
}

// Wipe the bubble's text + strokes (preserving the play button) and rebuild
// from data. Called for initial render and again for each slideshow frame.
function renderBubble(bubble, data) {
  bubble.querySelectorAll('.message-text, .message-strokes').forEach(el => el.remove());
  const playBtn = bubble.querySelector('.message-play');

  if (data.text) {
    const t = document.createElement('div');
    t.className = 'message-text';
    t.textContent = data.text;
    bubble.insertBefore(t, playBtn);
  }
  if (data.drawing) {
    const c = document.createElement('canvas');
    c.className = 'message-strokes' + (data.text ? '' : ' solo');
    bubble.insertBefore(c, playBtn);
    requestAnimationFrame(() => paintStrokes(c, data.drawing));
  }
}

// Slideshow: replay every subsequent message inside startMsg's bubble,
// flipnote-style. Bubble height is locked so longer follow-ups don't reflow.
const FLIPNOTE_FRAME_MS = 280;
function playFollowups(startMsg) {
  if (startMsg._playing) return;
  const all = Array.from(messageLog.children);
  const startIdx = all.indexOf(startMsg);
  const followups = all.slice(startIdx + 1).map(el => el._data);
  if (followups.length === 0) return;

  startMsg._playing = true;
  const bubble = startMsg.querySelector('.message-bubble');
  const header = startMsg.querySelector('.message-header');
  const originalData = startMsg._data;

  // Lock both width and height to the bubble's rendered sub-pixel dimensions
  // (via getBoundingClientRect, which returns floats — offsetWidth/Height
  // round to integers and can leave a 1-pixel shift). Also disable the
  // aspect-ratio rule so it can't override the explicit lock.
  const r = bubble.getBoundingClientRect();
  bubble.style.width        = r.width  + 'px';
  bubble.style.height       = r.height + 'px';
  bubble.style.aspectRatio  = 'auto';

  function show(data) {
    renderHeader(header, data);
    renderBubble(bubble, data);
    startMsg.classList.toggle('me', !!data.isMe);
  }

  let i = 0;
  function step() {
    if (i < followups.length) {
      show(followups[i++]);
      setTimeout(step, FLIPNOTE_FRAME_MS);
    } else {
      show(originalData);
      bubble.style.width        = '';
      bubble.style.height       = '';
      bubble.style.aspectRatio  = `${originalData.fieldW} / ${originalData.fieldH}`;
      startMsg._playing = false;
    }
  }
  step();
}

// ------- Stroke rendering -------
// Render onto a 1x backing store (no DPR upscaling) so the result is
// naturally pixelated — matches the lightweight pictochat aesthetic and
// halves the bitmap memory on retina screens.
function paintStrokes(canvasEl, drawing) {
  const rect = canvasEl.getBoundingClientRect();
  const dispW = Math.round(rect.width);
  if (dispW === 0) {
    requestAnimationFrame(() => paintStrokes(canvasEl, drawing));
    return;
  }
  // Cap height at the canvas width so a degenerate w/h ratio from a hostile
  // peer can't allocate a monster canvas (e.g. 440×1.8M px → tab crash).
  const dispH = Math.round(Math.min(dispW * (drawing.h / drawing.w), dispW));
  canvasEl.style.height = dispH + 'px';
  canvasEl.width  = dispW;
  canvasEl.height = dispH;
  const c = canvasEl.getContext('2d');
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const sx = dispW / drawing.w;
  const sy = dispH / drawing.h;
  const lineScale = Math.min(sx, sy);
  for (const s of drawing.strokes) drawStroke(c, s, sx, sy, lineScale);
}

function drawStroke(ctx, stroke, sx = 1, sy = 1, lineScale = 1) {
  const pts = stroke.p;
  ctx.strokeStyle = stroke.c;
  ctx.fillStyle   = stroke.c;
  ctx.lineWidth   = stroke.s * lineScale;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0] * sx, pts[0][1] * sy, (stroke.s * lineScale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.arc(pts[0][0] * sx, pts[0][1] * sy, (stroke.s * lineScale) / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * sx, pts[0][1] * sy);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0] * sx, pts[i][1] * sy);
  }
  ctx.stroke();
}

// ------- Helpers -------
function formatTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' +
         d.getMinutes().toString().padStart(2, '0');
}

// ------- Always-on focus -------
// No guard around active drags — we want the textarea to recover focus
// even if the canvas press momentarily blurred it, so the user can type
// and draw at the same time.
function ensureFocus() {
  const active = document.activeElement;
  if (active !== usernameInput && active !== messageInput) {
    messageInput.focus();
    const len = messageInput.value.length;
    messageInput.setSelectionRange(len, len);
  }
}
messageInput .addEventListener('blur',  () => setTimeout(ensureFocus, 0));
usernameInput.addEventListener('blur',  () => setTimeout(ensureFocus, 0));
window       .addEventListener('focus', () => setTimeout(ensureFocus, 0));

// Stop button taps from stealing focus. Without this, tapping any control
// button (play, send, clear, color, size, scroll-to-bottom) on iOS blurs
// the textarea, which dismisses the keyboard, which makes the app jerk
// up and down as the visual viewport resizes — and then snaps back when
// our blur handler re-focuses the textarea. preventDefault on mousedown
// keeps focus on the textarea throughout the click.
['mousedown', 'pointerdown'].forEach(type => {
  document.addEventListener(type, (e) => {
    const btn = e.target.closest('button');
    if (btn) e.preventDefault();
  });
});

setTimeout(ensureFocus, 80);
sizeCanvas();

// ------- Networking: discover public IP, hash to room key, join room -------
//
// "Same WiFi → same chatroom" works because everyone on a NAT shares the same
// public egress IP. Each peer hashes that IP into a room key, joins via
// Trystero (which uses public BitTorrent trackers as a free signaling layer),
// and then chats peer-to-peer over WebRTC DataChannels.

const ROOM_SALT = 'comms-pictochat-v1';
const STUN_URL  = 'stun:stun.l.google.com:19302';

// Pull our public IP from a WebRTC server-reflexive ICE candidate. No
// third-party HTTP API needed — STUN is free, fast, and only sees the
// minimum (the egress IP) that we'd be revealing to peers anyway.
function getPublicIP() {
  return new Promise((resolve, reject) => {
    let done = false;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_URL }] });
    pc.createDataChannel('discover');
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .catch(reject);

    pc.addEventListener('icecandidate', (e) => {
      if (done || !e.candidate) return;
      const cand = e.candidate;
      // Prefer the parsed fields; fall back to splitting the SDP candidate
      // string (`candidate:foundation comp transport prio ADDR port typ TYPE`).
      let type = cand.type;
      let addr = cand.address;
      if (!type || !addr) {
        const parts = (cand.candidate || '').split(' ');
        addr = parts[4];
        type = parts[7];
      }
      if (type !== 'srflx' || !addr) return; // server-reflexive = public address
      done = true;
      pc.close();
      resolve(addr); // IPv4 or IPv6 — normalized later by roomKeyInput()
    });

    setTimeout(() => {
      if (done) return;
      done = true;
      pc.close();
      reject(new Error('public IP discovery timed out'));
    }, 5000);
  });
}

// Turn a discovered public address into a room-grouping key.
// - IPv4: use the address as-is. Everyone behind the NAT shares it.
// - IPv6: there's usually no NAT — every device gets a unique global address
//   but shares the LAN's /64 prefix. Group by that prefix so same-network
//   IPv6 peers still land in the same room.
function ipv6Prefix64(ip) {
  ip = ip.split('%')[0];                   // strip any zone id (e.g. %en0)
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const fill = Array(Math.max(0, 8 - h.length - t.length)).fill('0');
  return [...h, ...fill, ...t].slice(0, 4).map(x => (x || '0').padStart(4, '0')).join(':');
}
function roomKeyInput(ip) {
  return ip.includes(':') ? 'v6:' + ipv6Prefix64(ip) : ip;
}

// SHA-256(keyInput + salt) → 32 hex chars. The salt isn't a real privacy
// boundary (anyone with the source can hash known IPs), but it does prevent
// passive observation of "this room hash = this exact public IP" without effort.
async function hashRoomKey(keyInput) {
  const buf = new TextEncoder().encode(keyInput + '.' + ROOM_SALT);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// Will be set to Trystero's send function once the room is joined.
// send() checks this to broadcast outgoing messages.
let broadcastMessage = null;

// ------- Defensive parsing of incoming peer messages -------
// We don't trust anything coming off the wire — a hostile or buggy peer
// could send malformed JSON, oversized payloads, or wrong types and crash
// receivers. Everything below is bounds-checked and clamped.

const MAX_NAME_LEN          = 24;       // generous over the 12-char client cap
const MAX_TEXT_LEN           = 4000;
const MAX_STROKES_PER_MSG    = 500;
const MAX_POINTS_PER_STROKE  = 5000;
const MAX_FIELD_DIM          = 4096;
const HEX_COLOR_RE           = /^#[0-9a-fA-F]{6}$/;

function toFiniteNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function sanitizeStroke(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const c = (typeof raw.c === 'string' && HEX_COLOR_RE.test(raw.c)) ? raw.c : '#000000';
  const s = clamp(toFiniteNumber(raw.s, 4), 1, 32);
  if (!Array.isArray(raw.p)) return null;

  const points = [];
  const max = Math.min(raw.p.length, MAX_POINTS_PER_STROKE);
  for (let i = 0; i < max; i++) {
    const pt = raw.p[i];
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const x = toFiniteNumber(pt[0], NaN);
    const y = toFiniteNumber(pt[1], NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    points.push([x, y]);
  }
  if (points.length === 0) return null;
  return { c, s, p: points };
}

function sanitizeIncomingMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const name   = typeof raw.name === 'string'
                   ? (raw.name.slice(0, MAX_NAME_LEN) || 'anon')
                   : 'anon';
  const text   = typeof raw.text === 'string'
                   ? raw.text.slice(0, MAX_TEXT_LEN)
                   : '';
  const fieldW = clamp(toFiniteNumber(raw.fieldW, 480), 1, MAX_FIELD_DIM);
  const fieldH = clamp(toFiniteNumber(raw.fieldH, 90),  1, MAX_FIELD_DIM);

  let drawing = null;
  if (raw.drawing && typeof raw.drawing === 'object' && Array.isArray(raw.drawing.strokes)) {
    const w = clamp(toFiniteNumber(raw.drawing.w, fieldW), 1, MAX_FIELD_DIM);
    const h = clamp(toFiniteNumber(raw.drawing.h, fieldH), 1, MAX_FIELD_DIM);
    const strokes = raw.drawing.strokes
      .slice(0, MAX_STROKES_PER_MSG)
      .map(sanitizeStroke)
      .filter(Boolean);
    if (strokes.length > 0) drawing = { strokes, w, h };
  }

  // Drop messages that have no text AND no drawing — pure noise.
  if (!text && !drawing) return null;

  return { name, text, drawing, fieldW, fieldH };
}

(async () => {
  try {
    log('discovering public IP via STUN…');
    const ip = await getPublicIP();
    log('public IP:', ip);

    const roomKey = await hashRoomKey(roomKeyInput(ip));
    log('room key:', roomKey);

    log('joining room…');
    const room = joinRoom({ appId: 'comms-pictochat' }, roomKey);
    if (DEBUG) window._commsRoom = room; // only exposed in debug mode

    const peerRates = new Map();

    // Connection state drives the send button color (muted vs mint). No peer
    // count is exposed — just a binary "is anyone listening".
    function updateConnectionState() {
      const hasPeers = Object.keys(room.getPeers()).length > 0;
      document.documentElement.classList.toggle('has-peers', hasPeers);
    }
    updateConnectionState();
    room.onPeerJoin((peerId) => { log('peer joined:', peerId); updateConnectionState(); });
    room.onPeerLeave((peerId) => {
      log('peer left:', peerId);
      peerRates.delete(peerId);  // don't accumulate rate buckets for gone peers
      updateConnectionState();
    });

    // Typed action channel for messages. makeAction returns [send, receive].
    const [sendMsg, onMsg] = room.makeAction('msg');
    broadcastMessage = sendMsg;

    // Per-peer rate limiter — drop messages above 10/sec/peer to keep a
    // hostile or runaway peer from flooding the room.
    function rateOk(peerId) {
      const now = Date.now();
      const arr = (peerRates.get(peerId) || []).filter(t => now - t < 1000);
      arr.push(now);
      peerRates.set(peerId, arr);
      return arr.length <= 10;
    }

    onMsg((raw, peerId) => {
      if (!rateOk(peerId)) return;
      const data = sanitizeIncomingMessage(raw);
      if (!data) return;
      appendMessage(data.name, data.text, data.drawing, data.fieldW, data.fieldH, false);
    });

    log('joined room — waiting for peers');
  } catch (err) {
    console.error('[comms] networking failed:', err);
  }
})();

// ------- Visual viewport tracking (mobile keyboard handling) -------
// iOS overlays the on-screen keyboard without shrinking 100dvh, so we track
// the visual viewport directly:
//   --app-h   = visualViewport.height   → app height = space above keyboard
//   --app-top = visualViewport.offsetTop → matches iOS's pan when it scrolls
//               the focused input into view, so the app's bottom sits flush
//               against the keyboard with no gap.
// This offset tracking is safe now that zoom is locked (maximum-scale=1) — the
// old "jerk" came from iOS zoom animation on focus, not from this.
function updateAppHeight() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (vv) {
    root.style.setProperty('--app-h',   vv.height    + 'px');
    root.style.setProperty('--app-top', vv.offsetTop + 'px');
  } else {
    root.style.setProperty('--app-h',   window.innerHeight + 'px');
    root.style.setProperty('--app-top', '0px');
  }
}
updateAppHeight();
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateAppHeight);
  window.visualViewport.addEventListener('scroll', updateAppHeight);
}
window.addEventListener('resize', updateAppHeight);
window.addEventListener('orientationchange', updateAppHeight);

// (Send/play button sizing is now pure CSS — proportional to the compose
// area / message bubble. No JS sync needed.)
