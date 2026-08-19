/**
 * Kiri Stay — Hotel Room Booking System
 * -------------------------------------
 * A self-contained Node.js backend. No external packages required —
 * everything here uses only Node's built-in modules (http, fs, crypto,
 * path, url). That means you can run this with nothing but:
 *
 *     node server.js
 *
 * Data is stored in data/db.json (a simple JSON "database"). This is
 * intentional for a student project: it's transparent, easy to inspect,
 * and needs zero setup (no MySQL/Postgres/Supabase account required).
 * If your course requires a real database, see README.md for notes on
 * swapping this for MySQL/Supabase later — the API layer would barely
 * change.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* Tiny JSON "database"                                               */
/* ------------------------------------------------------------------ */

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Password hashing (Node's built-in crypto — no bcrypt dependency)   */
/* ------------------------------------------------------------------ */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(attempt), Buffer.from(hash));
}

/* ------------------------------------------------------------------ */
/* Session tokens (in-memory)                                         */
/* ------------------------------------------------------------------ */

const sessions = new Map(); // token -> userId

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, userId);
  return token;
}

function getUserFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !sessions.has(token)) return null;
  const db = readDB();
  const userId = sessions.get(token);
  const user = db.users.find((u) => u.id === userId);
  return user || null;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8MB — covers a base64-encoded 5MB image with room to spare
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        // Stop accumulating (so we don't hold a giant string in memory) but
        // keep draining the stream so 'end' still fires — destroying the
        // socket here would drop the connection before the client ever
        // sees the error response.
        tooLarge = true;
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (tooLarge) return reject(new Error('PAYLOAD_TOO_LARGE'));
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, salt, ...safe } = u;
  return safe;
}

// Per-day booking count for a room. Kiri Stay treats every date on a given
// room as a single bookable slot — once ONE guest has booked a date, that
// date is closed to everyone else. A cancelled booking is excluded here,
// so cancelling immediately reopens that date for anyone to book again.
function bookedCountForDate(db, roomId, dateStr, excludeBookingId = null) {
  return db.bookings.filter((b) => {
    if (b.roomId !== roomId) return false;
    if (b.status === 'cancelled') return false;
    if (excludeBookingId && b.id === excludeBookingId) return false;
    return Array.isArray(b.dates) && b.dates.includes(dateStr);
  }).length;
}

// Normalize a comma-separated string OR an array into a clean string array.
// Used for both `amenities` and `gallery` so editing a room from the admin
// form never turns an array field into a raw string (that was the bug
// behind "Could not load rooms" — a string doesn't have .map()).
function toStringArray(value, splitOn = ',') {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(splitOn).map((s) => s.trim()).filter(Boolean);
}

// Normalizes a translatable field into a consistent { en, km, zh } shape,
// tolerating a plain string (treated as the English value) for safety
// with any older data.
function normalizeLocalized(val) {
  if (!val) return { en: '', km: '', zh: '' };
  if (typeof val === 'string') return { en: val, km: '', zh: '' };
  return { en: val.en || '', km: val.km || '', zh: val.zh || '' };
}

/* ------------------------------------------------------------------ */
/* Route handlers                                                     */
/* ------------------------------------------------------------------ */

const routes = [];
function route(method, pattern, handler) {
  // pattern like /api/rooms/:id -> regex with named group
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg;
    })
    .join('/');
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ method, regex, paramNames, handler });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(pathname);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
  }
  return null;
}

/* ---- Auth ---- */

route('POST', '/api/register', async (req, res) => {
  const body = await readBody(req);
  const { name, email, password } = body;
  if (!name || !email || !password) {
    return sendJSON(res, 400, { error: 'Name, email and password are required.' });
  }
  const db = readDB();
  if (db.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return sendJSON(res, 409, { error: 'An account with that email already exists.' });
  }
  const { salt, hash } = hashPassword(password);
  const user = {
    id: nextId(db.users),
    name,
    email,
    passwordHash: hash,
    salt,
    role: 'customer',
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  writeDB(db);
  const token = createSession(user.id);
  sendJSON(res, 201, { token, user: publicUser(user) });
});

route('POST', '/api/login', async (req, res) => {
  const body = await readBody(req);
  const { email, password } = body;
  const db = readDB();
  const user = db.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !verifyPassword(password || '', user.salt, user.passwordHash)) {
    return sendJSON(res, 401, { error: 'Invalid email or password.' });
  }
  const token = createSession(user.id);
  sendJSON(res, 200, { token, user: publicUser(user) });
});

route('POST', '/api/logout', async (req, res) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) sessions.delete(token);
  sendJSON(res, 200, { ok: true });
});

route('GET', '/api/me', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return sendJSON(res, 401, { error: 'Not logged in.' });
  sendJSON(res, 200, { user: publicUser(user) });
});

/* ---- Image uploads (admin only) ---- */

const UPLOAD_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB per photo — plenty for a room shot, keeps the demo fast

// Accepts a data URL (what FileReader.readAsDataURL gives the browser) and
// writes it to /public/images. No multipart form parsing needed since the
// image just travels as a base64 string inside a normal JSON body, which
// this server already knows how to read.
route('POST', '/api/uploads', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const body = await readBody(req);
  const { dataUrl } = body;
  if (!dataUrl || typeof dataUrl !== 'string') {
    return sendJSON(res, 400, { error: 'No image data received.' });
  }
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return sendJSON(res, 400, { error: 'That file is not a recognized image format.' });
  const mime = match[1];
  const ext = UPLOAD_MIME_EXT[mime];
  if (!ext) return sendJSON(res, 400, { error: 'Please upload a JPG, PNG, WEBP, or GIF image.' });

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return sendJSON(res, 413, { error: 'That image is over 5MB — please use a smaller file.' });
  }

  const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);
  sendJSON(res, 201, { url: `/images/${filename}` });
});

/* ---- Settings (small admin-configurable values) ---- */

route('GET', '/api/settings', async (req, res) => {
  const db = readDB();
  sendJSON(res, 200, { settings: db.settings || { standardCheckInTime: '2:00 PM' } });
});

route('PUT', '/api/settings', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const body = await readBody(req);
  const db = readDB();
  db.settings = db.settings || {};
  if (body.standardCheckInTime !== undefined) {
    db.settings.standardCheckInTime = String(body.standardCheckInTime).trim() || '2:00 PM';
  }
  writeDB(db);
  sendJSON(res, 200, { settings: db.settings });
});

/* ---- Contact messages ---- */
// Anyone can send one (the public contact form); only the admin can read,
// mark as seen, or delete them. This is the data behind the admin's
// notification bell and the /admin/messages.html inbox.

route('POST', '/api/messages', async (req, res) => {
  const body = await readBody(req);
  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const message = (body.message || '').trim();
  if (!name || !email || !message) {
    return sendJSON(res, 400, { error: 'Name, email, and message are all required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJSON(res, 400, { error: 'Please enter a valid email address.' });
  }
  const db = readDB();
  const msg = {
    id: nextId(db.messages || (db.messages = [])),
    name,
    email,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  };
  db.messages.push(msg);
  writeDB(db);
  sendJSON(res, 201, { message: msg });
});

route('GET', '/api/messages', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const db = readDB();
  const messages = (db.messages || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  sendJSON(res, 200, { messages });
});

route('PUT', '/api/messages/:id', async (req, res, params) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const db = readDB();
  const msg = (db.messages || []).find((m) => m.id === Number(params.id));
  if (!msg) return sendJSON(res, 404, { error: 'Message not found.' });
  const body = await readBody(req);
  msg.read = body.read !== undefined ? Boolean(body.read) : true;
  writeDB(db);
  sendJSON(res, 200, { message: msg });
});

route('DELETE', '/api/messages/:id', async (req, res, params) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const db = readDB();
  const idx = (db.messages || []).findIndex((m) => m.id === Number(params.id));
  if (idx === -1) return sendJSON(res, 404, { error: 'Message not found.' });
  db.messages.splice(idx, 1);
  writeDB(db);
  sendJSON(res, 200, { ok: true });
});

/* ---- Site content (CMS) ---- */
// Lets the admin edit the homepage/about page copy and images without
// touching code: hero, "Why Kiri Stay", "On site", "Building guide", the
// footer tagline, and the About page. Stored as db.content — one object
// per section, replaced wholesale on save (simplest thing that works for
// a handful of small, admin-only sections).

const CONTENT_SECTIONS = ['hero', 'whyKiriStay', 'onSite', 'buildingGuide', 'footer', 'about', 'contact'];

route('GET', '/api/content', async (req, res) => {
  const db = readDB();
  sendJSON(res, 200, { content: db.content || {} });
});

route('PUT', '/api/content/:section', async (req, res, params) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  if (!CONTENT_SECTIONS.includes(params.section)) {
    return sendJSON(res, 404, { error: 'Unknown content section.' });
  }
  const body = await readBody(req);
  const db = readDB();
  db.content = db.content || {};
  db.content[params.section] = body;
  writeDB(db);
  sendJSON(res, 200, { content: db.content[params.section] });
});

/* ---- Rooms ---- */

route('GET', '/api/rooms', async (req, res, params, query) => {
  const db = readDB();
  let rooms = db.rooms;
  if (query.get('type')) {
    rooms = rooms.filter((r) => r.type === query.get('type'));
  }
  sendJSON(res, 200, { rooms });
});

route('GET', '/api/rooms/:id', async (req, res, params) => {
  const db = readDB();
  const room = db.rooms.find((r) => r.id === Number(params.id));
  if (!room) return sendJSON(res, 404, { error: 'Room not found.' });
  sendJSON(res, 200, { room });
});

// Public: which individual calendar dates are already booked for this room
// (one guest is enough to close a date — see bookedCountForDate above), so
// the booking calendar can grey them out before someone even logs in. Only
// dates are exposed — no guest name or email.
route('GET', '/api/rooms/:id/booked-dates', async (req, res, params) => {
  const db = readDB();
  const roomId = Number(params.id);
  const room = db.rooms.find((r) => r.id === roomId);
  if (!room) return sendJSON(res, 404, { error: 'Room not found.' });
  const active = db.bookings.filter((b) => b.roomId === roomId && b.status !== 'cancelled');
  const counts = {};
  active.forEach((b) => (b.dates || []).forEach((d) => { counts[d] = (counts[d] || 0) + 1; }));
  const fullDates = Object.keys(counts).filter((d) => counts[d] >= 1);
  sendJSON(res, 200, { fullDates });
});

route('POST', '/api/rooms', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const body = await readBody(req);
  const { name, type, description, pricePerNight, capacity, amenities, image, gallery, floor } = body;
  if (!name || !type?.en || !pricePerNight) {
    return sendJSON(res, 400, { error: 'name, type (English), and pricePerNight are required.' });
  }
  const db = readDB();
  const galleryArr = toStringArray(gallery, '\n');
  const room = {
    id: nextId(db.rooms),
    name,
    type: normalizeLocalized(type),
    description: normalizeLocalized(description),
    pricePerNight: Number(pricePerNight),
    capacity: Number(capacity) || 2,
    amenities: normalizeLocalized(amenities),
    image: image || galleryArr[0] || '',
    gallery: galleryArr,
    floor: Number(floor) || 1,
    createdAt: new Date().toISOString(),
  };
  db.rooms.push(room);
  writeDB(db);
  sendJSON(res, 201, { room });
});

route('PUT', '/api/rooms/:id', async (req, res, params) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const db = readDB();
  const room = db.rooms.find((r) => r.id === Number(params.id));
  if (!room) return sendJSON(res, 404, { error: 'Room not found.' });
  const body = await readBody(req);
  const fields = ['name', 'type', 'description', 'pricePerNight', 'capacity', 'amenities', 'image', 'gallery', 'floor'];
  const numericFields = ['pricePerNight', 'capacity', 'floor'];
  const localizedFields = ['type', 'description', 'amenities'];
  fields.forEach((f) => {
    if (body[f] === undefined) return;
    if (numericFields.includes(f)) room[f] = Number(body[f]);
    else if (localizedFields.includes(f)) room[f] = normalizeLocalized(body[f]);
    else if (f === 'gallery') room[f] = toStringArray(body[f], '\n');
    else room[f] = body[f];
  });
  // If the gallery changed but no explicit thumbnail was given, keep the
  // thumbnail in sync with the first gallery photo.
  if (body.gallery !== undefined && body.image === undefined && room.gallery[0]) {
    room.image = room.gallery[0];
  }
  writeDB(db);
  sendJSON(res, 200, { room });
});

route('DELETE', '/api/rooms/:id', async (req, res, params) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const db = readDB();
  const idx = db.rooms.findIndex((r) => r.id === Number(params.id));
  if (idx === -1) return sendJSON(res, 404, { error: 'Room not found.' });
  db.rooms.splice(idx, 1);
  writeDB(db);
  sendJSON(res, 200, { ok: true });
});

/* ---- Bookings ---- */

route('GET', '/api/bookings', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return sendJSON(res, 401, { error: 'Please log in.' });
  const db = readDB();
  let bookings = user.role === 'admin' ? db.bookings : db.bookings.filter((b) => b.userId === user.id);
  bookings = bookings
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((b) => ({ ...b, room: db.rooms.find((r) => r.id === b.roomId) || null }));
  sendJSON(res, 200, { bookings });
});

route('POST', '/api/bookings', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return sendJSON(res, 401, { error: 'Please log in to book a room.' });
  const body = await readBody(req);
  const { roomId, dates, guests } = body;
  if (!roomId || !Array.isArray(dates) || dates.length === 0) {
    return sendJSON(res, 400, { error: 'roomId and at least one date are required.' });
  }

  // Clean the requested dates: de-dupe, sort, and validate the format —
  // guests pick individual calendar days, not necessarily a contiguous
  // range, so each date is checked for availability on its own.
  const uniqueDates = [...new Set(dates)].sort();
  const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const d of uniqueDates) {
    if (!dateFormat.test(d)) return sendJSON(res, 400, { error: `"${d}" is not a valid date.` });
    if (d < todayStr) return sendJSON(res, 400, { error: `${d} is in the past.` });
  }

  const db = readDB();
  const room = db.rooms.find((r) => r.id === Number(roomId));
  if (!room) return sendJSON(res, 404, { error: 'Room not found.' });

  // Re-check each date against the live database right before writing —
  // this is what stops two guests from ever booking the same room on the
  // same date past its unit count, even if their calendars were loaded
  // a few seconds apart.
  for (const d of uniqueDates) {
    const count = bookedCountForDate(db, room.id, d);
    if (count >= 1) {
      return sendJSON(res, 409, { error: `Sorry, ${d} is already booked for this room by someone else.` });
    }
  }

  const nights = uniqueDates.length;
  const totalPrice = nights * room.pricePerNight;
  // Kiri Stay requires a 60% deposit at booking time; the remaining 40% is
  // settled at check-in. This is a mock payment for the demo — no real
  // card processor is wired in — but the numbers are real and stored.
  const depositAmount = Math.round(totalPrice * 0.6 * 100) / 100;
  const balanceAmount = Math.round((totalPrice - depositAmount) * 100) / 100;
  const booking = {
    id: nextId(db.bookings),
    userId: user.id,
    roomId: room.id,
    guestName: user.name,
    guestEmail: user.email,
    dates: uniqueDates,
    guests: Number(guests) || room.capacity,
    nights,
    totalPrice,
    depositAmount,
    balanceAmount,
    depositPaid: true,
    status: 'confirmed',
    seenByAdmin: false,
    balancePaid: false,
    checkedInAt: null,
    checkedOutAt: null,
    cancelledAt: null,
    // A short code printed on the guest's check-in card/QR — front desk
    // staff match this against the card the guest shows on arrival.
    checkInCode: 'KS-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  writeDB(db);
  sendJSON(res, 201, { booking });
});

route('PUT', '/api/bookings/:id', async (req, res, params) => {
  const user = getUserFromRequest(req);
  if (!user) return sendJSON(res, 401, { error: 'Please log in.' });
  const db = readDB();
  const booking = db.bookings.find((b) => b.id === Number(params.id));
  if (!booking) return sendJSON(res, 404, { error: 'Booking not found.' });
  if (user.role !== 'admin' && booking.userId !== user.id) {
    return sendJSON(res, 403, { error: 'You can only manage your own bookings.' });
  }
  const body = await readBody(req);
  if (body.status) {
    // Terminal states — closed for everyone, no further edits by anyone
    // once reached. This is what makes "stop total price" real: a
    // checked-out (or cancelled) booking is a closed ledger line. If the
    // guest wants to stay longer, that's a new booking, not an edit to
    // this one.
    if (['cancelled', 'checked-out'].includes(booking.status)) {
      return sendJSON(res, 403, { error: `This booking is already ${booking.status} and can't be changed. If the guest wants to stay again, they'll need to make a new booking.` });
    }
    const allowed = user.role === 'admin'
      ? ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled']
      : []; // guests can no longer change their own booking's status —
             // cancellations go through the front desk (admin), who has
             // the full picture of deposits/refunds already paid.
    if (!allowed.includes(body.status)) {
      return sendJSON(res, 403, { error: 'Only the front desk can change a booking status. Please contact Kiri Stay to cancel.' });
    }
    booking.status = body.status;
    // Track when each transition actually happened, so the payment-activity
    // chart can bucket the balance (collected at check-in) and the refund
    // (issued on cancellation) on the day they really occurred — not just
    // the original booking date.
    const now = new Date().toISOString();
    if (body.status === 'checked-in') {
      booking.checkedInAt = now;
      booking.balancePaid = true; // the remaining 40% is settled at check-in
    } else if (body.status === 'checked-out') {
      booking.checkedOutAt = now;
    } else if (body.status === 'cancelled') {
      booking.cancelledAt = now;
    }
  }
  if (body.seenByAdmin !== undefined && user.role === 'admin') {
    booking.seenByAdmin = Boolean(body.seenByAdmin);
  }
  writeDB(db);
  sendJSON(res, 200, { booking });
});

route('DELETE', '/api/bookings/:id', async (req, res, params) => {
  const user = getUserFromRequest(req);
  if (!user) return sendJSON(res, 401, { error: 'Please log in.' });
  const db = readDB();
  const idx = db.bookings.findIndex((b) => b.id === Number(params.id));
  if (idx === -1) return sendJSON(res, 404, { error: 'Booking not found.' });
  const booking = db.bookings[idx];
  if (user.role !== 'admin' && booking.userId !== user.id) {
    return sendJSON(res, 403, { error: 'You can only manage your own bookings.' });
  }
  db.bookings.splice(idx, 1);
  writeDB(db);
  sendJSON(res, 200, { ok: true });
});

/* ---- Users (admin only, for the admin dashboard) ---- */

route('GET', '/api/users', async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const db = readDB();
  sendJSON(res, 200, { users: db.users.map(publicUser) });
});

// Forgot password, the admin-assisted way: a guest who's locked out
// contacts the front desk (phone / the Contact form), the admin verifies
// who they are, and resets it here. A fresh temporary password is
// generated and returned ONCE in this response — it is never stored in
// plain text and can't be retrieved again after this, so the admin must
// pass it along to the guest right away (in person, by phone, etc).
route('POST', '/api/users/:id/reset-password', async (req, res, params) => {
  const admin = getUserFromRequest(req);
  if (!admin || admin.role !== 'admin') return sendJSON(res, 403, { error: 'Admin access required.' });
  const db = readDB();
  const target = db.users.find((u) => u.id === Number(params.id));
  if (!target) return sendJSON(res, 404, { error: 'Account not found.' });
  const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 8);
  const { salt, hash } = hashPassword(tempPassword);
  target.passwordHash = hash;
  target.salt = salt;
  writeDB(db);
  sendJSON(res, 200, { tempPassword, user: publicUser(target) });
});

/* ------------------------------------------------------------------ */
/* Static file serving                                                */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  if (pathname === '/' || pathname === '') filePath = path.join(PUBLIC_DIR, 'index.html');
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Fallback: try adding .html (clean URLs like /rooms -> rooms.html)
      const withHtml = filePath + '.html';
      fs.stat(withHtml, (err2, stat2) => {
        if (err2 || !stat2.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        streamFile(res, withHtml);
      });
      return;
    }
    streamFile(res, filePath);
  });
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ */
/* Server                                                             */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    const match = matchRoute(req.method, pathname);
    if (!match) return sendJSON(res, 404, { error: 'Unknown API route.' });
    try {
      await match.handler(req, res, match.params, parsed.searchParams);
    } catch (err) {
      if (err.message === 'PAYLOAD_TOO_LARGE') {
        return sendJSON(res, 413, { error: 'That request is too large.' });
      }
      console.error(err);
      sendJSON(res, 500, { error: 'Server error.' });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Kiri Stay hotel booking server running at http://localhost:${PORT}`);
  console.log(`Admin login -> email: admin@kiristay.com  password: admin123`);
});
