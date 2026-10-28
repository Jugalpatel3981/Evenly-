# Evenly app (React Native)

The Android, iPhone and web versions of Evenly, built with Expo and Expo Router.
It uses the same Supabase project and database as the website in the folder above.

## Layout

- `src/app/`: screens. `(tabs)/` holds Groups, Friends, Activity and Account; `sign-in.tsx` is the sign-in screen.
- `src/lib/`: data and logic. `money.ts` is the split maths (the same as `../js/money.js`), `store.ts` loads and derives everything.
- `src/ui/`: shared pieces: colours and fonts (`theme.ts`), buttons, rows and fields (`kit.tsx`), icons.

## Commands

```bash
npm install
npx expo start          # try it on a phone with a development build, or in a browser
npx expo export -p web  # build the website into dist/
npx tsc --noEmit        # type check
npx expo lint           # lint
```

## Google sign-in on phones

The app comes back from Google at `evenly://auth`. In Supabase, Authentication → URL Configuration → Redirect URLs
must include `evenly://**`.
