# CourseCloud — Backend API

REST API backend for CourseCloud, built with **Node.js + Express** and **Supabase** (PostgreSQL + Storage).

## Setup

### 1. Install dependencies
```bash
cd Backend
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Then fill in `.env`:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret key (Project Settings → API) |
| `PORT` | Server port (default: `4000`) |
| `FRONTEND_URL` | Frontend origin for CORS (default: `http://localhost:5173`) |

> ⚠️ **Never commit `.env`** — it is already listed in `.gitignore`.

### 3. Start the server

Development (auto-restart on changes):
```bash
npm run dev
```

Production:
```bash
npm start
```

The server prints its URL and a health check link on startup.

---

## Endpoints

All `/api/*` routes require:
```
Authorization: Bearer <supabase_access_token>
```

### Health
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server liveness check (no auth required) |

### Courses
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/courses` | List active courses |
| `POST` | `/api/courses` | Create a course `{ name, code }` |
| `PATCH` | `/api/courses/:id` | Update `name`, `code`, or `last_accessed_at` |
| `DELETE` | `/api/courses/:id` | Soft-delete (moves to Trash) |
| `PATCH` | `/api/courses/:id/restore` | Restore from Trash |
| `DELETE` | `/api/courses/:id/permanent` | Permanently delete (cascades Storage + DB) |

### Files
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files` | List all active files (all courses) |
| `GET` | `/api/files/:id/signed-url` | Get signed URL (`?download=true\|false&expires=60`) |
| `DELETE` | `/api/files/:id` | Soft-delete (moves to Trash) |
| `PATCH` | `/api/files/:id/restore` | Restore from Trash |
| `DELETE` | `/api/files/:id/permanent` | Permanently delete (Storage + DB) |
| `GET` | `/api/courses/:courseId/files` | List active files for a course |
| `POST` | `/api/courses/:courseId/files` | Upload file (`multipart/form-data`, field: `file`) |

### Notes
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notes` | List all notes (all courses) |
| `POST` | `/api/notes` | Create a note `{ course_id, title, content? }` |
| `PATCH` | `/api/notes/:id` | Update `title`, `content`, `course_id` |
| `DELETE` | `/api/notes/:id` | Permanently delete a note |
| `GET` | `/api/courses/:courseId/notes` | List notes for a course |

### Trash
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/trash` | List all trashed items (courses + files, merged) |
| `GET` | `/api/trash/courses` | List only trashed courses |
| `GET` | `/api/trash/files` | List only trashed files |
| `DELETE` | `/api/trash/empty` | Empty trash (all trashed courses + files) |

---

## Project Structure

```
Backend/
├── .env.example            ← environment variable template
├── .gitignore
├── package.json
└── src/
    ├── server.js           ← Express app, middleware, route mounting
    ├── supabaseClient.js   ← Supabase admin client (service-role key)
    ├── middleware/
    │   └── auth.js         ← JWT verification (Bearer token → req.user)
    └── routes/
        ├── courses.js      ← /api/courses CRUD
        ├── files.js        ← /api/files + /api/courses/:id/files
        ├── notes.js        ← /api/notes + /api/courses/:id/notes
        └── trash.js        ← /api/trash/*
```

## Architecture Notes

- **Service-role key** — The backend uses Supabase's service-role key, which bypasses Row-Level Security. Ownership is enforced explicitly via `.eq("user_id", req.user.id)` in every query.
- **JWT verification** — `supabase.auth.getUser(token)` validates the user's Supabase access token on every request. No session state is stored on the server.
- **File uploads** — Multer `memoryStorage` buffers the file in RAM, then the bytes are streamed to Supabase Storage. A failed DB insert rolls back the Storage upload.
- **Soft-delete pattern** — Courses and files use `deleted_at` for trash; notes are hard-deleted immediately. This mirrors the existing frontend behaviour.
- **Automated purge** — The 24-hour trash cleanup is handled by the existing Supabase Edge Function `cleanup-trash`. This backend only exposes the manual "Empty Trash" action.
