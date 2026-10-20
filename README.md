# Evenly

A free Splitwise-style app. Friends make accounts and add shared expenses to
groups. Evenly keeps a live tally of who owes whom and works out the fewest
payments to settle up.

- Sign up, sign in and reset a password by email
- Groups with friends: invite people by email so they see the group when they sign in, or add someone by name only
- Split equally, by exact amounts, by percentages or by shares
- Balances, fewest-payment settle-up and a recorded payment history
- Spending by category, and what each person paid versus their share
- Live updates: when a friend adds an expense, it appears for everyone
- Works on phones: open it in your browser and use **Add to Home Screen**

Everything runs on free tiers: **Supabase** for accounts and the database,
plus any static host for the website.

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

## Good to know
- **Email limits:** Supabase's built-in email sender only allows a few emails per
  hour. That's fine for friends, but for more sign-ups connect a free SMTP service
  (for example Resend or Brevo) under **Authentication > Emails > SMTP Settings**.
- **Free project pausing:** Supabase pauses free projects after a week with no
  activity. Click **Restore** in the dashboard and your data is still there.
- **Testing without email confirmation:** you can turn off **Confirm email**
  under **Authentication > Sign In / Providers > Email**. Leave it on for
  real use: invites only link to confirmed emails.

## Files
| File | What it is |
|---|---|
| `index.html` | The page |
| `app.js` | All app logic: sign-in, groups, splits, balances |
| `styles.css` | Look and feel (light and dark mode) |
| `config.js` | Your Supabase URL and key |
| `supabase/schema.sql` | Tables, security rules and functions |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Let phones install it like an app |
