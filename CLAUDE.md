# CLAUDE.md

Student dashboard for Canvas LMS. Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, SWR. Every page is a client component that reads Canvas through a server-side proxy.

## Commands

```bash
npm run dev     # local dev on :3000
npm run build   # production build (also the type check; there are no tests)
npm run lint    # eslint (older files still have `any` errors; keep new code clean)
docker compose up --build   # production container (reads .env)
```

Local dev: set `DEV_MODE=1` with `CANVAS_BASE_URL` / `CANVAS_API_TOKEN` in `.env` to skip login (dev server only), or `MANUAL_MODE=1` to log in with a token. All settings are in `.env.example` and read in `src/lib/app-config.ts`.

## How a request flows

```
page (src/app/**/page.tsx)
  -> component (src/components/<feature>/*)
    -> SWR hook (src/hooks/use-canvas.ts)
      -> canvasApi (src/lib/canvas-api.ts)            fetch('/api/canvas/<path>?<query>')
        -> proxy (src/app/api/canvas/[...path]/route.ts)
             credentials from the encrypted portal_session cookie (src/lib/canvas-server.ts)
             forwards to <canvas_url>/api/v1/<path> with Authorization: Bearer <token>
             rewrites the Canvas Link header to /api/canvas/... so the client can paginate
```

- Add Canvas calls as methods on `CanvasAPI` in `src/lib/canvas-api.ts`, then a hook in `src/hooks/use-canvas.ts`. Endpoints are written without the `/api/v1` prefix.
- `request<T>()` is one call; `requestAll<T>()` follows `Link: rel="next"` pages. Use `requestAll` for every list endpoint, or data is silently cut off after one page.
- Errors are `CanvasApiError` with `.status` and `.details` (the Canvas response body).
- `getCourses()` and `getCurrentUser()` are memoized for 60s because every "all courses" fetcher needs them.
- SWR settings: 60s dedupe, no revalidate on focus. Keys are strings like `canvas_all_assignments`; after a write, `mutate()` the affected keys instead of reloading the page.
- Every data hook goes through `useCanvasData` (use-canvas.ts). Its `loading` means "nothing to show yet"; cached data shows while SWR refreshes it.

## Loading speed

- First screen first: `src/lib/first-screen.ts` counts the loads made through `useCanvasData`; when they finish, the first screen is "settled". Hooks called with `{ deferred: true }` wait for that (the Home counters, the sidebar unread count).
- Then `src/components/layout/preloader.tsx` loads, two at a time, what the other pages show first (calendar month, inbox list, first course's grades and files, To-Do, announcements, discussions, each course's home). Each unit mounts the page's own hooks, so the keys match. Never preload a single conversation or discussion (opening one can mark it read). Hovering a course link (`warmCourse`) loads that course at once.
- The all-assignments load fills the per-course lists and single assignments too (`loadAllAssignments`), and `useUpcomingAssignments` is derived from it (no second download).
- The app draws without waiting for `/api/auth/session`: the readable `canvas_signed_in` cookie (`{access, url}`, no secrets, same lifetime as the session) says someone is signed in; the server check follows in the background.
- SEO: `src/lib/site.ts` holds the title, description, GitHub link and `siteUrl()` (SITE_URL, else Vercel's production domain). Only `/home` is indexed (root layout says noindex, the home page overrides it); `src/app/robots.ts`, `src/app/sitemap.ts` and `src/app/opengraph-image.png` (link preview) sit next to it.
- `/home` looks the same for everyone on every refresh. It is rendered per request (`dynamic = 'force-dynamic'`) only so `MANUAL_MODE` can change without a rebuild; it reaches the page as a prop from the server page. Signed in, its login buttons open the dashboard. The demo loads in the browser behind a skeleton (`DemoSkeleton`).

## Canvas API rules that bit us

- Announcements: always send `start_date` and `end_date`, or Canvas returns only the last 14 days.
- Calendar events: Canvas honors at most 10 `context_codes[]` per request; `getCalendarEventsOfType` batches them. Personal events need `user_<id>`.
- Discussions: `/entries` returns only top-level posts plus `recent_replies`. Use `/view` (`getDiscussionThread`) for the full tree. A 403 with `require_initial_post` means the student must post first.
- Classic quizzes as a student: start (or resume) a quiz submission, then read questions from `/quiz_submissions/:id/questions`. The course quiz questions endpoint is teacher-only. Multiple-choice answers are numeric answer ids. New Quizzes are `external_tool` assignments with no student API.
- "Submitted" means `isSubmitted()` in `src/lib/submission-status.ts` (`submitted_at`, `pending_review`, excused, or graded and not missing). Don't re-implement it.
- File uploads for submissions run server-side in `src/app/api/upload/submission/route.ts` (request slot, upload without the token, confirm the Location with the token).
- Proxy rules (`src/app/api/canvas/[...path]/route.ts`): `/login/*` and `/users/:id/tokens` are blocked for everyone (they hand out a Canvas web login or API tokens); writes need a same-origin request (`isSameOriginRequest`); a trailing `.json` is stripped before the rules run; redirects are followed only within the Canvas site (`canvasServerFetch`).
- Hosts the server fetches without the token (file storage, upload slots) and token-login Canvas sites must be public (`src/lib/public-address.ts`), so the server can't be pointed at internal addresses.
- "Download course" (`src/components/course/course-download-dialog.tsx`) lists everything in a course: course info (syllabus, announcements), each module in order (files, pages, assignments, discussions, quizzes, links), then what no module has (assignments, pages, discussions, files by folder). It posts the chosen `{kind, ref, title, path, group}` list to `src/app/api/files/zip/route.ts` in a hidden frame. The route streams one ZIP (`client-zip`, no compression): files through `openCanvasFile()` (`src/lib/canvas-files-server.ts`, shared with the single-file route), everything else rendered to standalone HTML by `src/lib/course-export.ts`, which also rewrites links to the local copies and writes `index.html` (failed items are marked there). Four items are fetched ahead.
- File bytes are streamed by `src/app/api/files/[fileId]/route.ts`. Only images, PDF, audio, video and plain text are served inline, with a Content-Type from a fixed list (`inlineContentType`, decided by MIME type, not the file name) and a sandbox CSP; everything else downloads as `application/octet-stream`, so uploaded HTML can't run on our origin. Use `fileContentUrl()` from `src/lib/files.ts`, never raw Canvas file URLs.
- Canvas HTML (pages, descriptions, posts) goes through `<CanvasHtml>` (`src/components/shared/canvas-html.tsx`), which opens file links in the preview dialog and keeps course links in-app. Styles live under `.canvas-html` in `globals.css`.

## Auth and sessions

- The landing page is `/home` (`src/components/auth/landing-page.tsx`): login on top, a clickable demo dashboard below (sample data in `src/components/auth/demo/`, never Canvas). Logged-out visitors on any app page are sent there by `MainLayout`; public pages are `/home`, `/login`, `/auth/*`. The "Canvas" wordmark in the sidebar and phone header links to `/home`.
- Telegram login with approval: the bot's `/portal` sends `/auth/<code>`, which shows the landing page with `LinkApprovalDialog` popped up. The dialog calls `POST /api/auth/link/start`, and the portal (`PORTAL_URL`, `POST /api/portal/login/request`) uses up the code and sends Approve/Deny buttons in Telegram. The dialog polls `GET /api/auth/link/status` (portal `POST /api/portal/login/status`, secret poll token kept in an httpOnly cookie); only after Approve does the portal return the Canvas credentials, once, and the session starts. Portal code: `login_approval.py` in the canvas.sonungo.com repo.
- Web sessions: after approval the portal creates a session (`web_sessions.py` in the portal repo) and returns its id and secret; they live in the session cookie (`sid`, `ssec`). `lookupCanvasSession()` (and `requireCanvasSession()` for API routes) asks the portal whether it is still active (`src/lib/portal-session.ts`, `POST /api/portal/session/check`, cached 60 s per server, a recent "active" is trusted for 10 minutes if the portal is down). Logged out in Telegram (`/sessions`) or idle means 401 and the cookies are removed; portal unreachable means 503 and nobody is logged out; the client re-checks after any 401 (`canvas:unauthorized` event) and on every page change, then goes to `/home`. Website logout calls `POST /api/portal/session/end`. Every portal call sends `portalHeaders()` (`src/lib/app-config.ts`): with `PORTAL_API_KEY` set on both sides, the portal only answers this server.
- Access levels: Telegram offers View only (recommended), Full access or Deny. The session cookie stores `access`; `lookupCanvasSession()` returns it, and the Canvas proxy and upload route answer 403 to any write in a view-only session. The client reads `useAuth().isViewOnly` to hide write controls (`ViewOnlyNote` where a submit form would be; there is no page-wide banner). Manual token login and DEV_MODE are full access.
- The approval message includes device (`src/lib/device.ts`), location and IP (`src/lib/request-location.ts`; hosting headers or ipapi.co, `LOCATION_LOOKUP=0` to disable).
- Token login: with `MANUAL_MODE=1`, "Login via Canvas token" opens `token-login-dialog.tsx` -> `/api/auth/login` (public https hosts or `ALLOWED_CANVAS_HOSTS`, checked with `/users/self`).
- The session cookie `portal_session` is AES-256-GCM encrypted (`src/lib/session.ts`, key = SHA-256 of `SESSION_SECRET`) and holds `{ canvas_url, canvas_token, user_id, access, sid, ssec }`. The token never reaches the browser.
- Logged out after 1 hour without activity. The cookies last 1 hour and `src/proxy.ts` (Next 16 middleware) re-sets them on each request, except link prefetches and the `/api/auth/*` routes (other than activity), which set or clear the cookies themselves; it also redirects HTTP to HTTPS outside localhost and skips static files. In the page, `src/lib/inactivity.ts` watches clicks, typing and scrolling (shared by all tabs through localStorage), pings `POST /api/auth/activity` every 5 minutes while someone is active, and logs out after an hour without any.
- `DEV_MODE=1` (only under `next dev`) skips the cookie and uses `CANVAS_BASE_URL` / `CANVAS_API_TOKEN` from the environment.

## App data that is not in Canvas

- None. Personal to-dos are Canvas planner notes (per student, synced with the Canvas planner).

## Where things live

| Route | Main component |
| --- | --- |
| `/` | Home: `src/components/dashboard/dashboard.tsx` (upcoming, recent grades, courses, links to To-Do / Announcements / Discussions) |
| `/assignments` | `src/components/assignments/assignments-page.tsx` |
| `/courses/[courseId]` | course hub: home, modules, pages, files, assignments, announcements, discussions (`src/components/course/*`) |
| `/courses/[courseId]/assignments/[assignmentId]` | submission status, your submission, rubric, comments, submit form, quiz engine |
| `/courses/[courseId]/quizzes/[quizId]` | redirects to the quiz's assignment, or runs ungraded quizzes |
| `/courses/[courseId]/pages/[pageUrl]` | wiki page view |
| `/courses/[courseId]/discussions/[discussionId]` | `src/components/discussions/discussion-thread.tsx` |
| `/files` | `src/components/files/*` (browser, preview dialog) |
| `/inbox` | `src/components/inbox/*` |
| `/grades` | `src/components/grades/*` (weights, grading periods, what-if) |
| `/todo`, `/calendar`, `/announcements`, `/discussions` | matching folder in `src/components/` |

- Canvas response types: `src/lib/types.ts`.
- The sidebar shows the student's Canvas profile picture; `usableAvatar()` (`src/lib/avatar.ts`) filters out Canvas's grey placeholder, and then the first letter shows on the brand color.
- Course colors come from the student's Canvas settings: `useCourseColors().getColor(courseId)` with an inline style.
- Course labels: use `courseTitle()` / `courseCode()` from `src/lib/course-name.ts`, never `course_code` directly (schools truncate it).
- Look: Link-style light theme and shotscreen's dark theme. Grey frame (`bg-shell`), each page in a bordered panel, sidebar with six main links plus courses. Colors are tokens in `globals.css`.
- Pick-one lists inside a page (courses on Grades and Files) use `SideList` / `SideListItem` from `src/components/shared/side-list.tsx`, styled like the sidebar.
- Phones: every responsive grid needs a base `grid-cols-1` and `minmax(0,1fr)` instead of `1fr`, or a long line of text widens the column past the screen (the page panel clips it). Check pages at 390px wide.
- README screenshots (`docs/screenshots/`) use sample data only, never a real Canvas account: the landing page's demo, and for app screens (like `download-course.png`) a browser whose `/api/canvas/*` requests are all answered with made-up data. Run the server with `MANUAL_MODE=0` before taking them.
- Icons: Phosphor only (`@phosphor-icons/react`, the `…Icon` names, e.g. `CaretRightIcon`). Regular weight; `weight="fill"` marks the active sidebar item. Use icons for navigation and list tiles, not in titles or badges.
- `src/components/ui/*` is generated shadcn/ui; add components with the shadcn CLI rather than hand-editing.
