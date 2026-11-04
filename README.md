# Evenly

**Evenly is a free mobile and web app that tracks shared expenses, IOUs and running balances among
roommates, friends, couples and travel groups.** Add a bill, choose how to split it, and Evenly keeps a
live tally of who owes whom, then works out the fewest payments to settle up.

**Try it:** <https://evenly-tracker.netlify.app>. It works in any browser, installs on your phone's Home
Screen, and is also available as an Android app.

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/groups.png" width="220" alt="Groups, with the total balance and what each person owes you"><br><sub>Your groups and balances</sub></td>
    <td align="center"><img src="docs/screenshots/group.png" width="220" alt="A trip group's expenses, with who lent and who borrowed"><br><sub>A group's expenses</sub></td>
    <td align="center"><img src="docs/screenshots/split-by-items.png" width="220" alt="Adding an expense split item by item"><br><sub>Split by items</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/details.png" width="220" alt="Expense details with who paid, who owes, and comments"><br><sub>Details and comments</sub></td>
    <td align="center"><img src="docs/screenshots/balances.png" width="220" alt="Group balances with suggested payments"><br><sub>Balances</sub></td>
    <td align="center"><img src="docs/screenshots/settle-up.png" width="220" alt="Settling up, with a Pay with UPI button"><br><sub>Settle up, pay with UPI</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/spending.png" width="220" alt="Monthly spending chart and category budgets"><br><sub>Spending and budgets</sub></td>
    <td align="center"><img src="docs/screenshots/activity.png" width="220" alt="Activity feed of everything that happened"><br><sub>Activity</sub></td>
    <td align="center"><img src="docs/screenshots/dark-mode.png" width="220" alt="A home group in dark mode"><br><sub>Dark mode</sub></td>
  </tr>
</table>

## Features

**Splitting**
- One-to-one with a friend, or in a group (trip, home, couple, other)
- Split equally, by exact amounts, percentages or shares, equally with +/− adjustments, or item by item
  (tax and tip shared in proportion)
- Several people paying for one expense, and one bill with several friends outside any group
- Save a group's usual split as the default for new expenses
- Recurring expenses: weekly, every 2 weeks, monthly or yearly
- About 45 categories with icons, guessed from the description
- Simplified debts: the fewest payments to settle everything, switchable per group

**Money**
- Any currency on any expense, with balances kept per currency
- Today's exchange rates to convert an expense, and an overall total in your own currency
- Pay with UPI, PayPal or Venmo straight from Settle up
- Monthly spending by category, a six-month chart and optional budgets
- Group totals: who paid what, each person's share, month by month

**Together**
- Find friends by name; invite anyone else with a link or QR code
- Phone notifications and emails when you're added to an expense, it changes, someone comments,
  or someone reminds you to pay
- Comments on expenses, alongside a full history of every change
- Receipt photos (private to the group), notes, group cover photos and a shared whiteboard
- Restore deleted expenses
- An activity feed across all your friends and groups

**Everywhere**
- Sign in with email or Google
- Android app, plus a website that installs on any phone's Home Screen
- Works offline: your balances stay visible, and changes sync when you're back online
- Light and dark themes
- Export a group as a spreadsheet, or download a backup of all your data

## How it's built

| Part | What it uses |
|---|---|
| App (web, Android, iPhone) | [Expo](https://expo.dev) and React Native, written in TypeScript. One code base in `mobile/` |
| Accounts, database, photos | [Supabase](https://supabase.com): Postgres with row level security, so people only see groups they belong to |
| Notifications and email | The `notify` Supabase Edge Function: web push, Expo push for the app, and email through Brevo |
| Website hosting | [Netlify](https://netlify.com), rebuilt automatically from `main` |
| Android builds | Expo's build service, started from GitHub Actions |

Everything runs on free plans.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 and [Git](https://git-scm.com).

```bash
git clone https://github.com/Jugalpatel3981/Evenly-.git
cd Evenly-/mobile
npm install
npx expo start --web
```

Evenly opens at <http://localhost:8081>. It uses the live database, so anything you add is real.
To sign in with Google locally, add `http://localhost:8081/**` to Supabase's redirect URLs (see below).

Checks before shipping a change:

```bash
npx tsc --noEmit      # type check
npx expo lint         # lint
```

## Setting up your own copy

### 1. Database
1. Create a free project at <https://supabase.com>.
2. In **SQL Editor**, run the whole of [`supabase/schema.sql`](supabase/schema.sql). It's safe to run
   again after every update, and your data stays.
3. Put your project's URL and **anon key** (Project Settings → API) in
   [`mobile/src/lib/supabase.ts`](mobile/src/lib/supabase.ts). The anon key is meant to be public:
   row level security protects the data.

### 2. Sign-in
In **Authentication → URL Configuration**, set **Site URL** to your website's address, and add these
**Redirect URLs**: your site followed by `/**`, and `evenly://**` for the Android app.

For Google sign-in, create an OAuth client in Google Cloud (Web application), with Supabase's callback
URL as the redirect URI, then paste its ID and secret under **Authentication → Sign In / Providers → Google**.

### 3. Notifications and email
1. **Edge Functions**: deploy [`supabase/functions/notify/index.ts`](supabase/functions/notify/index.ts)
   as a function named `notify`, with **Verify JWT** turned off.
2. **Edge Functions → Secrets**: add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (web push),
   `BREVO_API_KEY` and `MAIL_FROM` (email), and `APP_URL` (your website).
3. Open `https://<project>.supabase.co/functions/v1/notify` in a browser to see what's set up.

The public VAPID key also goes in [`mobile/src/lib/push.web.ts`](mobile/src/lib/push.web.ts).

### 4. Website
Connect the repository to Netlify. [`netlify.toml`](netlify.toml) already has the build settings, and
every push to `main` goes live in a few minutes.

### 5. Android app
1. Make a free account at <https://expo.dev> and create an access token
   (Account settings → Access tokens).
2. In GitHub, add it as a repository secret named `EXPO_TOKEN`
   (Settings → Secrets and variables → Actions).
3. Run **Actions → Build Android app**. **preview** makes an `.apk` to install on a phone;
   **production** makes an `.aab` for the Play Store.

## Where things are

| Folder | What's in it |
|---|---|
| `mobile/src/app/` | The screens: tabs, group and friend pages, forms |
| `mobile/src/lib/` | Data, maths and services: `money.ts` (splits and balances), `store.ts` (loading, offline queue), `rates.ts`, `push.ts` |
| `mobile/src/ui/` | Shared building blocks: theme, buttons, lists, charts, the split editor |
| `mobile/public/` | Website-only files: service worker, Home Screen manifest, icons, privacy policy |
| `supabase/` | `schema.sql` (tables, security rules, functions) and the `notify` function |
| `docs/screenshots/` | The pictures in this README |
| `index.html`, `js/`, `styles.css`, `tests/` | The first version of the website, written in plain JavaScript, kept for reference |

## Good to know

- **Free database pausing:** Supabase pauses a free project after a week with no use. Click **Restore**
  in its dashboard and everything is back.
- **Email limits:** Supabase's built-in sender only sends a few emails an hour. Evenly's own emails go
  through Brevo (300 a day free).
- **iPhone:** add the website to the Home Screen from Safari (Share → Add to Home Screen) to get
  notifications on iPhone.

## Privacy

Evenly only stores what it needs to work out balances, has no ads, and doesn't sell or share data.
Read the full [privacy policy](https://evenly-tracker.netlify.app/privacy.html).
