# Voice Agent Frontend

Frontend for the AI voice scheduling assistant. This repo hosts the web UI for:

- Live voice sessions (LiveKit)
- Avatar video stream (controlled by env)
- Tool call feed and summary drawer

**Features**

- Identify users by phone number
- Fetch available slots (suggestions only)
- Book appointments and prevent double booking
- Retrieve appointments for a user
- Cancel appointments
- Modify appointment date/time
- End conversation with summary
- Live tool call toasts + drawer
- Audio‑only mode when avatar is disabled (env‑controlled)

**Tech Stack**

- Next.js (App Router)
- Tailwind CSS
- LiveKit Client

**Prerequisites**

- Node 18+
- Backend URL (FastAPI)

**Setup**

```bash
npm install
```

**Environment Variables**

- `NEXT_PUBLIC_BACKEND_HTTP_URL`
- `NEXT_PUBLIC_BACKEND_WS_URL`
- `NEXT_PUBLIC_BEY_ENABLED` (`true` or `false`)

**Run Locally**

```bash
npm run dev
```

**Build**

```bash
npm run build
npm run start
```

**Deployment (Vercel)**

- Add env vars above
- Redeploy after changes
