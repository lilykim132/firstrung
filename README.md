# FirstRung

Interview prep for students and early-career people landing their first internship or job. Students practice with an AI interviewer that asks varied, role-specific questions and scores answers honestly. When they're ready, they can request a live session with a real person in their field.

This is the pilot MVP. Requests for real people are matched by hand from the Founder view.

## What's in it

| Feature | Where |
| --- | --- |
| AI mock interview, live mode (follow-up questions) or recorded mode (30s prep, 90s answer, HireVue-style) | `#practice` |
| Voice answers (Chrome, Edge, Safari) or typing | `#practice` |
| Scorecard: readiness verdict, STAR check, biggest fix, stronger opening per answer | `#practice` |
| Request a live mock, career chat or story workshop with a real person | `#people` |
| Pilot survey after each session (usefulness, willingness to pay) | `#practice` |
| Founder dashboard: requests with status, ratings, repeat use, % who'd pay | `#founder` (password) |

## Project layout

```
public/          static site (index.html, app.js)
api/interview.js AI questions, follow-ups and grading (Anthropic API)
api/requests.js  students create and check their real-person request
api/feedback.js  post-session pilot survey
api/admin.js     founder dashboard data (password protected)
lib/             storage and auth helpers
```

Students don't sign in. Each browser gets a random id stored locally, which ties a student to their own request and ratings.

## Deploy on Vercel

1. **Push to GitHub.**
   ```bash
   git init
   git add .
   git commit -m "FirstRung MVP"
   git branch -M main
   git remote add origin https://github.com/<your-username>/firstrung.git
   git push -u origin main
   ```
2. **Import the repo** at vercel.com/new. Framework preset: **Other**. Leave build settings as they are.
3. **Add storage.** In the Vercel project, open **Storage → Create / Marketplace → Upstash (Redis)**, pick the free plan and connect it to the project. This adds the storage keys automatically.
4. **Add environment variables** in **Settings → Environment Variables**:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com (add billing credit there).
   - `FOUNDER_PASSWORD`: any password you choose for the Founder view.
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.
6. Open `https://<your-app>.vercel.app/#founder` and sign in to see the dashboard.

## Run locally

```bash
npm install
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```

## Costs and limits

- Each session makes 1 call to write questions, up to 5 quick follow-up calls (live mode), and 1 grading call. Expect a few cents per session.
- Each visitor IP is limited to 60 AI calls per hour (`AI_HOURLY_LIMIT`) so a shared link can't run up your bill.
- The models default to `claude-sonnet-5-5` and `claude-haiku-5-5`; change them with `ANTHROPIC_MODEL` and `ANTHROPIC_FAST_MODEL`.

## Privacy note

Student requests (name, email, notes) are stored in your Upstash database and only shown in the Founder view. Interview answers are sent to the Anthropic API for scoring and are not stored.
