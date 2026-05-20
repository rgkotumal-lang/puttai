# PuttAI – AI-Powered Golf Putting Coach

A mobile-first Progressive Web App (PWA) that uses your device's rear camera to overlay a real-time putting path and grid. After your shot, AI analyzes the result and gives specific coaching tips. Stats tracked over time with localStorage.

## Features

- Live camera feed with putting path overlay, break visualization, and grid
- Adjustable green speed (stimp 6–14) and break direction/intensity controls
- AI-powered shot analysis via Claude (coaching tips per putt)
- Top-down result placement SVG for marking where the ball stopped
- Stats screen: make% by distance, miss pattern scatter plot, week-over-week change
- PWA — installs to home screen on iOS Safari and Android Chrome
- Fully offline-capable UI (AI tips require connection)

## Local Setup

```bash
git clone <your-repo>
cd puttai
npm install
```

Create `.env.local`:
```
ANTHROPIC_API_KEY=your_key_here
NEXT_PUBLIC_APP_NAME=PuttAI
```

Get an Anthropic API key at https://console.anthropic.com/

```bash
npm run dev
```

Open http://localhost:3000 in a browser. For camera testing, open it on your phone's browser pointed at your local IP (e.g. `http://192.168.1.x:3000`) — camera requires HTTPS in production.

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to vercel.com → New Project → import your repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Deploy

Vercel provides HTTPS automatically, which enables camera access on mobile browsers.

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS v4
- Anthropic Claude API (`claude-sonnet-4-20250514`)
- localStorage (no database needed for MVP)
- Browser `getUserMedia` for camera access
