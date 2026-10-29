# Evenly

A free Splitwise-style app. Friends make accounts and add shared expenses to
groups. Evenly keeps a live tally of who owes whom and works out the fewest
payments to settle up.

**Splitting**
- Friends (one-to-one, no group needed) and groups (trip, home, couple, other)
- Split equally, by exact amounts, percentages, shares, or equally with +/− adjustments
- Several people paying for one expense
- One bill with several friends, outside any group
- Any currency, per expense; balances are kept per currency
- Recurring expenses: weekly, every 2 weeks, monthly, yearly
- About 45 categories with icons, guessed from the description
- Simplified debts (fewest payments), switchable per group
- Each friend's balance across every group you share

**Notifications and payments**
- Everyone in an expense is told when it's added, changed or deleted, commented on or paid, except whoever did it
- Phone notifications, email, and a bell with unread count in the app
- Remind someone who owes you (once a day)
- Receipt photos on expenses (private to the group)
- Pay with UPI, PayPal or Venmo straight from Settle up

**Together**
- Notes and comments on expenses
- Full change history, and restoring deleted expenses
- Activity feed across all friends and groups
- Invite links and QR codes to join a group or a friend ledger
- Group cover photos and a shared whiteboard
- Profile photo, name, default currency, email, password, delete account
- Live updates on every device; installable on phones

Everything runs on free tiers: **Supabase** for accounts and the database,
**Netlify** for the website, and **Expo** to build the Android app.

## Where things are

- `mobile/`: the app, built with Expo and React Native. The same code is the website (Netlify builds it,
  see `netlify.toml`) and the Android and iPhone app (`.github/workflows/android.yml` builds it on Expo).
  See `mobile/README.md`.
- `supabase/`: the database (`schema.sql`, safe to run again after every update) and the `notify` function
  that sends phone notifications and emails.
- `index.html`, `js/`, `styles.css`, `sw.js`, `vendor/`: the first, plain-JavaScript version of the website,
  kept for reference. `tests/` holds its money tests and the `notify` function's tests.

## Setup (about 10 minutes, free)

### 1. Create the database
1. Sign up at <https://supabase.com> and click **New project**. Pick any name
   and a database password, and choose the region closest to you (for example Mumbai).
2. When the project is ready, open **SQL Editor > New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
   You should see "Success. No rows returned".

### 2. Connect the app
1. In Supabase, open **Project Settings > API**, or click the **Connect** button.
2. Copy the **Project URL** and the **anon / publishable key** into `config.js`.
   The anon key is safe to publish. The database's row level security only lets
   people see groups they belong to.

### 3. Put it online
Choose one option:
- **Netlify Drop (easiest):** go to <https://app.netlify.com/drop> and drag this
  whole folder onto the page. You get a link like `https://evenly-123.netlify.app`.
- **GitHub Pages:** push this folder to a GitHub repo, then go to
  **Settings > Pages > Deploy from branch**.
- **Vercel / Cloudflare Pages:** import the repo. No build command is needed.

### 4. Tell Supabase your site's address
In Supabase, open **Authentication > URL Configuration** and set **Site URL**
to your site's link. Add the same link under **Redirect URLs**. Confirmation and
password-reset emails then bring people back to your app.

That's it. Open your link, create an account, confirm your email, and make a group.

## Installing on phones
Send friends your link. Then:
- **Android (Chrome):** open the link and tap **Install app** when it pops up, or use the **⋮** menu > **Install app** / **Add to Home screen**.
- **iPhone (Safari):** open the link, tap the **Share** button, then **Add to Home Screen**. (On iPhone, this only works from Safari.)
- **Computer (Chrome or Edge):** click the install icon at the right of the address bar.

Evenly then opens full-screen from its own icon, like any other app. Updates
arrive automatically: friends never need to reinstall.

## How invites work
When you add a friend to a group with their email, they're "invited". As soon
as they sign up (or sign in) with that email and confirm it, the group appears
in their account. Someone added by name only is still part of the splits; they
just can't sign in to see them.

## Updating
This repo is connected to Netlify: every push to `main` goes live automatically
in about 30 seconds. When an update changes the database, run
`supabase/schema.sql` again in the Supabase SQL Editor. It's safe to re-run,
and your data stays.

## Good to know
- **Email limits:** Supabase's built-in email sender only allows a few emails per
  hour. That's fine for friends, but for more sign-ups connect a free SMTP service
  (for example Resend or Brevo) under **Authentication > Emails > SMTP Settings**.
- **Free project pausing:** Supabase pauses free projects after a week with no
  activity. Click **Restore** in the dashboard and your data is still there.
- **Testing without email confirmation:** you can turn off **Confirm email**
  under **Authentication > Sign In / Providers > Email**. Leave it on for
  real use: invites only link to confirmed emails.

## Notifications setup
Notifications are created in the database and delivered by the `notify` Edge Function
(`supabase/functions/notify/index.ts`).
1. Run `supabase/schema.sql` in the SQL Editor (it enables `pg_net` and the delivery trigger).
2. Supabase > Edge Functions > Deploy a new function > Via Editor. Name it `notify`, paste
   `index.ts`, deploy, then turn off **Verify JWT** in the function's settings.
3. Edge Functions > Secrets: add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `BREVO_API_KEY`,
   `MAIL_FROM` (a sender verified in Brevo) and `APP_URL`.
4. Open `https://<project>.supabase.co/functions/v1/notify` in a browser: it reports what is set up.

The public VAPID key also goes in `config.js`. Brevo's free plan sends 300 emails a day;
`RESEND_API_KEY` works instead if you own a domain verified in Resend.

## Tests
Run `npm test` (Node 20+) to check the split and balance maths, and
`EVENLY_TEST=1 deno test -A --node-modules-dir=none tests/notify.deno.test.ts` for the notify function.

## Files
| File | What it is |
|---|---|
| `index.html` | The page |
| `js/main.js` | Startup, sign-in, button handling |
| `js/views.js`, `js/sheets.js` | Screens and forms |
| `js/state.js` | Data loading and derived balances |
| `js/money.js` | Split and balance maths (tested in `tests/`) |
| `js/categories.js`, `js/icons.js` | Categories and icons |
| `js/push.js`, `js/messages.js` | Phone notifications and their wording |
| `supabase/functions/notify/` | Sends phone notifications and emails |
| `vendor/` | QR-code library |
| `styles.css` | Look and feel (light and dark mode) |
| `config.js` | Your Supabase URL and key |
| `netlify.toml` | Netlify settings (no build step) |
| `supabase/schema.sql` | Tables, security rules and functions |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Let phones install it like an app |
