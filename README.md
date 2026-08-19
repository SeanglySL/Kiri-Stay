# Kiri Stay — Hotel Room Booking System
# SL Seangly Kiri Stay Hotel
A full-stack hotel room booking website: public website (home, rooms, room
detail + booking, about, contact), customer accounts with booking history,
and an admin dashboard with full CRUD on rooms and bookings.

Built with **plain Node.js on the backend** (no Express, no npm install
required) and **plain HTML/CSS/JavaScript** on the frontend (no React
build step). This was a deliberate choice so the project runs immediately
on any machine with Node installed — nothing to configure, no dependency
versions to fight with, and every line of backend code is something you
can explain to your supervisor.

---

## 1. What you need installed

- **Node.js** version 18 or newer (this was built and tested on Node 22).
  Check with: `node -v`
  If you don't have it: https://nodejs.org (download the LTS installer).

That's it. There is no `npm install` step — the backend only uses
Node's built-in modules (`http`, `fs`, `crypto`, `path`, `url`).

---

## 2. Where the files go

Unzip the project anywhere on your computer, e.g. your Desktop. Keep the
folder structure exactly as it is — the server expects it:

```
hotel-booking/                  ← the whole project folder
├── server.js                   ← the backend (run this file)
├── package.json                ← project info (no dependencies)
├── README.md                   ← this file
├── data/
│   └── db.json                 ← the "database" (plain JSON file)
└── public/                     ← everything the browser loads
    ├── index.html               (home page)
    ├── rooms.html                (browse/filter rooms)
    ├── room-detail.html          (room details + booking form)
    ├── about.html
    ├── contact.html
    ├── login.html
    ├── register.html
    ├── dashboard.html            (customer: "my bookings")
    ├── admin/
    │   ├── index.html            (admin: overview stats)
    │   ├── rooms.html             (admin: manage room types — CRUD)
    │   ├── bookings.html          (admin: manage all bookings)
    │   └── users.html             (admin: view registered customers)
    ├── css/
    │   └── style.css             (all styling — one file, imports Google Fonts)
    └── js/
        ├── app.js                (shared: API helper + login-state header)
        ├── home.js, rooms.js, room-detail.js, login.js, register.js,
        │   dashboard.js, admin-overview.js, admin-rooms.js, admin-bookings.js
        └── (one script per page, loaded only by that page)
```

You do not need to move any file individually — the whole `hotel-booking`
folder is the project. Just don't rename or move `server.js` relative to
the `public/` and `data/` folders, since it looks for them next to itself.

---

## 3. How to run it

1. Open a terminal (Command Prompt / PowerShell / Terminal app).
2. `cd` into the project folder, e.g.:
   ```
   cd Desktop/hotel-booking
   ```
3. Start the server:
   ```
   node server.js
   ```
4. You should see:
   ```
   Kiri Stay hotel booking server running at http://localhost:3000
   Admin login -> email: admin@kiristay.com  password: admin123
   ```
5. Open your browser to **http://localhost:3000**

To stop the server, go back to the terminal and press `Ctrl + C`.

---

## 4. Logging in

**Admin account (pre-created):**
- Email: `admin@kiristay.com`
- Password: `admin123`
- Go to **http://localhost:3000/login.html**, log in, and you'll land on
  the admin dashboard (`/admin/index.html`) automatically.

**Customer accounts:**
- Anyone can register at **http://localhost:3000/register.html**.
- After registering you're logged in automatically and taken to
  **/dashboard.html**, where booked rooms and their status appear.

---

## 5. How the pieces fit together (for your report / defense)

- **`server.js`** is the only backend file. It does three jobs:
  1. Serves the static files in `public/` (your website's HTML/CSS/JS).
  2. Exposes a REST API under `/api/...` (rooms, bookings, users, auth).
  3. Reads and writes `data/db.json` as the data store.

- **Authentication**: passwords are never stored in plain text — they're
  hashed with Node's built-in `crypto.scrypt`. Logging in returns a
  random session token, which the browser stores in `localStorage` and
  sends back on every request as `Authorization: Bearer <token>`.

- **Authorization / roles**: every room-management and booking-status
  endpoint checks `user.role === 'admin'` on the server before allowing
  the change — the admin pages in `public/admin/` are not "secure" by
  hiding a link, they're secure because the API rejects non-admins even
  if someone opens the URL directly.

- **Availability logic**: each room *type* (e.g. "Executive Suite") has a
  `totalUnits` count. `unitsBookedInRange` in `server.js` counts existing
  overlapping bookings for that room type and compares them to
  `totalUnits` — this is what stops the same room type from being
  double-booked past its capacity.

- **Booking calendar**: each room page has a click-to-select date-range
  calendar (`public/js/calendar.js`). It calls the public
  `GET /api/rooms/:id/booked-dates` endpoint (no login required) so any
  visitor can see which nights are already fully booked before they log
  in — dates are greyed out once every unit of that room type is taken
  for that night, so two guests can't book over each other.

- **60% deposit**: booking a room calculates `depositAmount` (60% of the
  total) and `balanceAmount` (the remaining 40%, due at check-in). This
  is a mock payment for the demo — no real card processor is wired in —
  but the numbers are computed and stored on the booking record
  (`depositAmount`, `balanceAmount`, `depositPaid`), and shown to both
  the guest (dashboard) and the admin (bookings table).

- **Floors**: each room type now has a `floor` number. The home page
  groups rooms floor by floor (Floor 1, Floor 2, …) and the admin room
  form lets you set which floor a room type is on.

- **Photo uploads**: the admin room form has a real file picker (JPG,
  PNG, WEBP, GIF — up to 5MB each) alongside the URL textarea. Selected
  photos are read in the browser, sent to `POST /api/uploads` as a
  base64 data URL, and written to `public/images/` on the server —
  no third-party storage or npm package involved. The first photo
  becomes the room's thumbnail everywhere else on the site.

- **Site Content CMS**: `admin/content.html` (linked from every admin
  page's sidebar under "Site Content") lets the admin edit the home
  page hero, the "Why Kiri Stay" stats, the "On Site" amenity cards,
  the "Building Guide" floor list, the footer tagline, and the About
  page — text and images, with add/remove buttons for repeatable boxes
  (stat cards, amenity cards, floor rows, paragraphs, bullet points).
  It's stored as `db.content` and served publicly via `GET
  /api/content`; `public/js/home.js` and `public/js/about.js` render
  those pages entirely from that data, so an edit here shows up on the
  live site immediately, no code changes needed. Image fields support
  both a pasted URL and a direct file upload (same pipeline as room
  photos).

- **Sticky footer**: the page `<body>` is a flex column
  (`min-height:100%`) with `.site-footer { margin-top: auto; }`, so the
  footer always sits at the bottom of the viewport — even on a tall
  screen or a filtered room list with zero results — instead of riding
  up right under a short block of content.

- **Contact form + admin inbox**: the public contact form
  (`/contact.html`) posts to `POST /api/messages` (name, email,
  message — all required, email format checked). The admin sees them
  at `/admin/messages.html`: a per-sender summary (name, email, total
  messages, unread count) plus the full message list, each with a
  "Reply by email" button (a `mailto:` link pre-filled with the
  guest's address and a subject line — no email service or API key
  needed), a "Mark as seen" button, and a delete button. A bell icon
  in the admin header (`public/js/admin-bell.js`, injected on every
  admin page) shows a live unread-count badge and a quick dropdown of
  who's messaged; clicking a sender jumps to their messages in the
  inbox. Marking as seen or deleting refreshes the bell immediately.

- **Simulated payment (Card + Bank QR)**: after picking dates, "Continue
  to payment" opens two tabs — **Visa/Card** (formatted card number
  with live Visa/Mastercard brand detection, MM/YY expiry, CVV, name,
  with real client-side validation) and **Bank QR / KHQR** (a QR code
  generated via the free, keyless `api.qrserver.com` image API, a
  5-minute countdown, and an "I've paid" button). This is a **demo
  payment only — no real card processor or bank is contacted, and no
  money moves.** A card number ending in `0002` always simulates a
  decline (the same convention real payment sandboxes use) so both the
  success and failure paths are demoable; a QR whose timer runs out
  before "I've paid" is clicked also simulates a failure. On a
  simulated success, the booking is created (with its 60/40 deposit
  split) and the admin is notified via the bell/Bookings page
  (`seenByAdmin: false` until the admin views `/admin/bookings.html`).
  On a simulated failure, nothing is booked — the guest sees a clear
  failure reason and a "Try again" button that returns them to the
  same dates. See the note in section 7 below on wiring this up to a
  real gateway (e.g. ABA PayWay) later.

- **Admin notifications for new bookings**: same bell as messages —
  a new booking (from a successful simulated payment) adds to the
  unread badge and appears under "New bookings" in the dropdown.
  Opening `/admin/bookings.html` marks them all seen automatically.

- **Booking lifecycle: pending → confirmed → checked-in → checked-out**
  (or → cancelled at any point before check-in). `/admin/bookings.html`
  has one-click "Check in" and "Check out" buttons alongside the status
  dropdown. **Checked-out and cancelled are terminal** — once a booking
  reaches either, the server rejects any further status change for
  *everyone*, admin included (`server.js`, `PUT /api/bookings/:id`).
  That's what "stops the total price": a closed booking's numbers never
  move again, and a guest who wants to stay longer makes a **new**
  booking rather than editing the old one — same as a paper ledger line,
  once written, isn't erased. A guest can still cancel their own
  booking, but not once it's already checked in.

- **No-show detection**: a booking is flagged "no-show" (front-end
  label only, nothing stored) when its last date is in the past and it
  never got past `confirmed`/`pending` — i.e. the guest simply never
  showed up. Shown as a tag on `/admin/bookings.html` and counted on
  the analytics page.

- **`/admin/analytics.html` ("Booking & Payments")**: real data, no
  mock. Three "right now" operational cards (currently checked in,
  no-show count, cancelled & refunded) plus a date-range picker driving
  a donut chart (room-type booking share) and a stacked bar chart
  (deposit / balance-at-check-in / refund per day), all built with
  [Chart.js from a CDN](https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.0/chart.umd.min.js)
  — no npm install, matching the rest of the project. Every booking
  now also stores `checkedInAt` / `checkedOutAt` / `cancelledAt`
  timestamps so the chart can bucket revenue events on the day they
  actually happened, not just the original booking date. Stat cards are
  color-coded (green = checked-in/revenue, amber = deposits/no-shows,
  red = cancellations/refunds), there's a one-click "Today" preset, and
  hovering a bar segment lists which specific rooms make up that day's
  deposits / check-ins / refunds.

- **Fixed a real timezone bug**: date-picking used
  `Date.prototype.toISOString()`, which converts to UTC before reading
  off the date — for any timezone ahead of UTC (e.g. Cambodia, UTC+7),
  this silently shifted every picked date back by one day, so a guest
  clicking "the 20th" was actually booking the 19th. Fixed everywhere
  with a shared `localISODate()` helper (`public/js/app.js`) that reads
  the date in the browser's own local time instead. This also fixed the
  analytics page defaulting to the wrong day and showing "no activity"
  when "Today" was selected.

- **Room types are free-text, not a fixed list**: the admin's "Type"
  field is a text input with autocomplete suggestions drawn from
  whatever types are currently in use — add a brand-new type just by
  typing it, and a type quietly disappears from the suggestions once no
  room uses it anymore. No separate list to manage.

- **Removed "Total Units" entirely**: since a date can only ever be
  booked once per room (see the per-day booking rule above), the old
  "how many identical rooms" field no longer meant anything and has
  been removed from the admin form, the rooms table, the room detail
  page, and the API — one less thing to fill in, no more confusing
  "units left" text anywhere.

- **Guest check-in ID card**: every booking gets a short `checkInCode`
  (e.g. `KS-5F98BA`) generated at booking time. The dashboard's "View
  ID" button (which replaced "Cancel" — see below) and the admin
  Bookings page's own "View ID" button both open the same card: room
  name, the date(s) the guest actually needs to check in on, a
  standard check-in time, the code, a QR encoding that code, and the
  hotel's name — so front-desk staff can visually match what the guest
  shows on their phone. If a guest booked contiguous days (e.g. Aug
  8-10 straight through), the card shows a single check-in date (Aug
  8). If they booked separate stays (e.g. Aug 8 and, separately, Aug
  15), the card lists a check-in line for each stay.

- **Guests can no longer self-cancel**: `PUT /api/bookings/:id` now
  rejects any status change from a non-admin — cancellations go
  through the front desk. The dashboard's old "Cancel" button was
  replaced with "View ID" for this reason.

- **Contact page is CMS-editable**: address, phone, email, and hours
  are now a seventh section in `/admin/content.html`, following the
  same pattern as the other site-content sections.

- **Analytics chart shows each day's bottom line**: on top of the
  stacked deposit/balance/refund bars, a small custom Chart.js plugin
  draws that day's net total directly above its bar — green for a net
  gain, red for a net loss — so you don't have to add up the segments
  yourself.

- **Language switcher (EN / ខ្មែរ / 中文)**: a small toggle in the
  header on every public page, backed by `public/js/i18n.js`. Unlike
  the earlier version, this now translates **all site content**, not
  just navigation — the hero, room names' type/description/amenities,
  "Why Kiri Stay", "On Site" cards, the Building Guide, the footer
  tagline, and the About and Contact pages. The only thing that stays
  fixed in every language is the hotel name "Kiri Stay" itself and each
  room's own name (e.g. "Garden Single") — the same way a proper noun
  doesn't get translated. The check-in ID card also stays in English by
  design, since it's meant to be read the same way by any front-desk
  staff member regardless of which language the guest was browsing in.

  Under the hood: every translatable field is stored as
  `{ en, km, zh }` instead of a plain string, and `localText(field)`
  (in `app.js`) resolves it to the browser's current language,
  falling back to English. Switching language re-renders already-loaded
  data instantly via a `kiristay:lang-changed` event — no re-fetch.

- **Admin content is entered in all 3 languages**: creating or editing
  a room (`/admin/rooms.html`) now shows three stacked inputs — English,
  Khmer, Chinese — for **Type**, **Description**, and **Amenities**.
  Room **name** and **price** stay single fields, since those aren't
  translated. Every field across the whole Site Content CMS
  (`/admin/content.html` — Hero, Why Kiri Stay, On Site, Building
  Guide, Footer, About, and the new Contact section) follows the same
  three-language pattern, including every item inside a repeatable list
  (stat boxes, amenity cards, floor rows, paragraphs, bullet points).
  The shared `i18nRowsHTML()` / `readI18nField()` helpers in `app.js`
  generate and read these field groups consistently everywhere.

- **Admin-configurable check-in time**: `/admin/bookings.html` has a
  small "Standard check-in time" field (defaults to 2:00 PM, stored via
  `GET/PUT /api/settings`) that the admin can change at any time — new
  check-in ID cards immediately reflect the updated time.

- **Admin-assisted password reset**: a guest who's locked out contacts
  the front desk (a "Forgot your password?" link on `/login.html`
  points to the Contact page). After verifying who they are, the admin
  opens `/admin/users.html` and clicks "Reset password" next to that
  guest — a fresh random temporary password is generated server-side
  (`POST /api/users/:id/reset-password`, admin-only) and shown **once**
  in a dialog for the admin to relay to the guest. It's never stored or
  shown again after that — same handling as any other password.

- **Room booking share (donut chart) now counts days, not bookings**:
  a single 3-day booking counts 3x as much as a 1-day booking toward a
  room type's share — matching actual nights-on-the-books rather than
  just transaction count. ("Bookings started" stays a count of booking
  records, unchanged.) Hovering a donut segment now shows a small
  calendar highlighting the exact dates that room type was booked on,
  instead of just a percentage.

- **Fixed the admin sidebar losing its menu on scroll**: `.dash-side`
  is now `position: sticky`, so on a long page like Site Content the
  navigation stays pinned in view instead of scrolling away with the
  content.

- **Check-in / Check-out lifecycle**: a booking's `status` now covers
  `pending`, `confirmed`, `checked-in`, `checked-out`, and `cancelled`.
  `/admin/bookings.html` has one-click **Check in** and **Check out**
  buttons alongside the status dropdown. Checking in marks the 40%
  balance as paid (`balancePaid: true`) and stamps `checkedInAt`;
  checking out stamps `checkedOutAt`; cancelling stamps `cancelledAt`.
  A checked-out booking is a closed, historical record — there's no
  "extend stay" feature, so a guest who wants more nights makes a new
  booking, same as a real front desk would treat it. A confirmed
  booking whose last date has passed without ever being checked in is
  labelled **no-show** in the bookings table (computed on the fly, not
  stored, so it self-corrects if you check them in late).

- **Booking & Payments analytics** (`/admin/analytics.html`, wired to
  the real database — not a mockup): three operational stat cards
  (currently checked in, no-shows, cancelled & refunded) plus a
  date-range picker that drives a **room booking-share donut chart**
  and a **stacked payment-activity bar chart** (deposit collected at
  booking, balance added at check-in, refund subtracted at
  cancellation — using `createdAt` / `checkedInAt` / `cancelledAt`
  respectively, so the chart reflects when each event actually
  happened). Charts are drawn with Chart.js loaded from cdnjs — the
  only third-party script in the project, added as a `<script>` tag,
  no npm/build step involved.

- **`data/db.json`** is a single JSON file with three arrays: `users`,
  `rooms`, `bookings`. It's intentionally simple so you can open it in
  any text editor and see exactly what the app is storing. If your
  course requires a "real" database, this is the one piece you'd swap —
  the API routes in `server.js` would stay structurally the same, just
  replacing `readDB()`/`writeDB()` with SQL queries (MySQL, PostgreSQL,
  or Supabase, all mentioned as backend options on your tech slide).

---

## 6. Resetting the demo data

If your test bookings pile up and you want a clean slate for a demo,
just replace `data/db.json` with this content (one admin, four rooms,
no bookings), then restart the server:

```json
{
  "users": [ /* keep the existing admin object from the file */ ],
  "rooms": [ /* keep the existing 4 room objects from the file */ ],
  "bookings": []
}
```

Simplest approach: back up a clean copy of `data/db.json` right after
your first run (before you start testing bookings), and copy it back
whenever you want to reset.

---

## 7. Extending it further (ideas for your Discussion section)

- Payment step (mock or real, e.g. Stripe test mode)
- Email confirmation on booking (Node's `nodemailer`, or a transactional
  email API)
- Guest reviews / star ratings per room
- Image uploads for rooms instead of static placeholders
- Swapping `data/db.json` for Supabase/MySQL for true multi-user
  concurrency (the current JSON-file store is fine for a demo but not
  for production traffic)
