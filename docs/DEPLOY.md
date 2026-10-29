# Putting the app online (Vercel)

About 15 minutes. Free on Vercel's Hobby plan (for personal, non-commercial use).

## 1. Get the latest code onto GitHub
In the `dnd-ai` folder (PowerShell):

```
npm install
npm test
git add -A
git commit -m "Polish pass + Next.js security update"
git push
```

`npm install` is needed because Next.js went from 16.4.0 to 16.4.3 (security fix).

## 2. Create the project on Vercel
1. Go to vercel.com → **Sign up / Log in with GitHub**.
2. **Add New → Project** → pick `morski13/dnd-ai` → **Import**.
3. Framework: Next.js (found automatically). Leave the build settings as they are.
4. Open **Environment Variables** and add, one by one (copy the values from your `.env.local`):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` |
| `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | Groq (AI 1) |
| `AI_2_...`, `AI_3_...` | your backups, if you set them up (see `lib/ai/env-example.txt`) |

   Tip: you can paste your whole `.env.local` into the first Name box and Vercel splits it into rows.
5. **Deploy**. When it's done you get an address like `https://dnd-ai-xxxx.vercel.app`.

## 3. Tell Supabase the new address
Supabase → your project → **Authentication → URL Configuration**:
- **Site URL**: your Vercel address (`https://dnd-ai-xxxx.vercel.app`). The "confirm your email" links point here.
- **Redirect URLs** → Add: `https://dnd-ai-xxxx.vercel.app/**` and `http://localhost:3000/**` (so your laptop keeps working).

## 4. Try it
- Log in on your phone with the Vercel address (DM account).
- In a private window, sign up as a player, join with the invite code from Home, claim a character, roll once.
- On the phone: browser menu → **Add to Home screen**. It opens like an app ("Tiny Hut").

## After that
- Every `git push` to `main` puts a new version online by itself (about 1–2 minutes).
- Changed a key? Vercel → Project → Settings → Environment Variables, then **Deployments → ⋯ → Redeploy**.
- Never put keys in the code or commit `.env.local` (the repo is public).
