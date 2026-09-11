# FacePass

**Contactless Facial Attendance & Intelligent Geo-Fenced Timeclock**

A modern attendance system that uses facial recognition and geofencing to eliminate buddy punching and location spoofing — built for field-heavy African businesses.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│  FastAPI Backend │────▶│    Supabase     │
│  (React Native) │     │   (Python)      │     │   (Postgres)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              ▲
                              │
                        ┌─────────────────┐
                        │  Admin Dashboard │
                        │    (Next.js)     │
                        └─────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Mobile App | React Native (Expo) + TypeScript |
| Backend API | FastAPI (Python) |
| Database | Supabase (Postgres + pgvector) |
| Admin Dashboard | Next.js 14 + TypeScript |
| Face Recognition | ArcFace / InsightFace |
| Auth | Supabase Auth |

## Project Structure

```
FacePass/
├── mobile/          # React Native (Expo) mobile app
├── backend/         # FastAPI backend
├── admin/           # Next.js admin dashboard
└── supabase/        # Database migrations
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Expo CLI (`npm install -g expo-cli`)
- A Supabase project (get one at https://supabase.com)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Fill in your Supabase credentials
uvicorn app.main:app --reload
```

API docs available at http://localhost:8000/docs

### 2. Mobile App

```bash
cd mobile
npm install
npx expo start
```

### 3. Admin Dashboard

```bash
cd admin
npm install
npm run dev
```

Admin dashboard available at http://localhost:3000

## Environment Variables

Create `.env` files in `backend/` and configure:

| Variable | Description |
|----------|------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (backend only) |
| `SECRET_KEY` | JWT signing secret |

## License

Private — All rights reserved.
