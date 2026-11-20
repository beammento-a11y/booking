# What's new – Rentals (Mentor Hall, Computer Lab, Lounge & Pantry)

## Pages
| File | What it is |
|---|---|
| `index.html` | **NEW main page** – 4 cards: PTE Simulation Exam + the 3 rental spaces, booking terms under the cards, contact box |
| `exam.html` | The **existing exam booking page, unchanged** (only a "Home" link added to its menu). Old `index.html` moved here |
| `hall.html` `lab.html` `lounge.html` | **NEW** one page per rental: photos, packages & rates, extras, booking form with live price estimate, "My bookings", terms |
| `admin.html` | Existing admin + **new "Rentals" menu** (Spaces & rates · Bookings · Terms & contact) |
| `rent-data.js` `rent.js` `rent.css` `site.css` `admin-rentals.js` | shared code/styles (nothing to edit) |
| `Code.gs` | The **updated Google Apps Script** (same one shown in Admin → Google Sheet) |
| `firestore.rules` | **FULL hardened security rules** (replace the whole Rules tab) |
| `admin-errors.js` | Admin → **Error log** page |
| `img/` | Photos cropped from the brochure PDF (used until you upload your own in admin) |

## Card behaviour
* **Available** space → tap the card → popup with packages & rates → **Book** button → that space's booking page.
* **Disabled** space → card is greyed + "Not available". Tap/hover still opens the popup so people can read the packages, but there is **no Book button** and the booking page shows the form closed.
* Admin → Rentals → Spaces & rates → **Enable / Disable booking** (instant).

## Admin → Rentals
* **Spaces & rates**: Enable/Disable · *Edit details & rates* (name, tagline, description, features, highlight numbers, layouts, packages with prices/types, extras, up to 3 photos).
* **Bookings**: all rental requests (filter by space / status / month), change status (pending → confirmed → completed / cancelled), ⚠ marks time overlaps, delete. New requests show a pop-up toast.
* **Terms & contact**: the terms shown under the cards (one per line), included-with-booking list, WhatsApp, email, address, hours.
* Give an admin access with **Admins → permissions → "Rentals"** (super admin always has it).
* Storage page now also counts **Rentals**, and the monthly **Delete old data** also removes that month's rental bookings (admin password still required).

## Google Sheet (same spreadsheet, separate tabs)
After you update the script, one spreadsheet holds:
* existing exam tabs + Overview (unchanged)
* `Rent – Mentor Hall`, `Rent – Computer Lab`, `Rent – Lounge and Pantry` → every rental request/status change (rows are never deleted; cancelled/deleted = marked *Cancelled*)
* `Rental Rates` → current rates + availability of every space
* `Rental Changes` → log of each rate / availability / terms change (when, what, who)

## Security: data & pages cannot be changed with "Inspect"
A browser can always edit **its own copy** of a page (DevTools) – that cannot be stopped, but it only changes what *that visitor* sees. What matters is that it can **never change your data**. That is enforced on the server by `firestore.rules`:
* Visitors can only: read public content, create one **pending** booking (every field validated), cancel **their own** booking (they hold the random code), add one error line. Nothing else.
* They **cannot**: change rates/packages/availability, book a **disabled** space (the rule checks `spaces/<id>.available`), set a booking to *confirmed*, forge a booking (exam booking must match the real slot/date/time and raise the seat counter by exactly 1, never above capacity), edit/delete other bookings, list other people's bookings, read the error log or any admin data.
* Rental **prices are never trusted from the browser**: the admin panel recalculates the price from the current rates. If a customer edited the price, Rentals → Bookings shows **⚠ customer sent Rs X** and the system price is saved when you change the status.
* Optional extra: **App Check** (reCAPTCHA v3) blocks fake clients/bots. Firebase Console → App Check → register the web app (reCAPTCHA v3) → paste the *site key* into `APPCHECK_SITE_KEY` in `common.js` → watch the metrics for a few days → then press **Enforce** for Firestore.
* Known limit (needs Cloud Functions / Blaze plan to close completely): a determined person could still free seats of an exam slot by lowering its counter; the admin Registrations list always shows the real bookings.

## Errors: never shown to visitors, saved for admins only
* Any system error (Firebase, network, code bug, uncaught JS error) on **any page** shows the visitor only *"Something went wrong. Please try again in a moment."* – never codes, rules or technical text.
* The details (time, page, error code, message, stack, browser) are saved to Firestore `errorLogs`. **Only admins with the "Error log" permission can read it** (Admin → Error log; super admin always).
* Admin gets a red badge on the menu, a pop-up when a new error arrives (+ desktop notification if you press "Enable desktop alerts", works while the admin tab is open), mark-read / delete / delete-all. Logs older than 30 days are deleted automatically. Duplicates and floods are limited (max 10 per visitor per visit).
* The browser's own console (F12) may still print raw errors – that is the visitor's own browser and cannot be switched off from a website, but nothing technical is shown on the page.

## Update steps (≈10 minutes)
1. **Upload all files** to your GitHub repo (replace old ones; your Firebase config in `common.js` is already included). GitHub Pages redeploys.
2. **Firestore rules**: open `firestore.rules` → copy **everything** → Firebase Console → Firestore → Rules → paste (replace all) → **Publish**. (It covers every collection the site uses: meta, secure, admins, examDates, slots, bookings, spaces, rentBookings, gallery, settings, errorLogs.)
3. **Apps Script**: Admin → Google Sheet → copy the script (or open `Code.gs`) → paste over the old one → Save → **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy** (same /exec URL).
4. Admin → Google Sheet → **Sync all data now**.
5. Admin → **Rentals** → *Save them to the database*, check rates/photos, Enable the spaces you want open.
6. Admin → **Admins** → give other admins the new permissions **Rentals** / **Error log** if needed (super admins already have them).
7. Test once: open the site in a private window → book a seat and a rental; then in Admin check Registrations, Rentals → Bookings and Error log.
