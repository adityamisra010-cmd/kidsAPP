# BUILD PROMPT: "My Kid's Tracker" (working name)

> Paste this whole file into Claude Code as the first message, or save it as `PROMPT.md` in an empty repo and tell Claude Code: "Read PROMPT.md and build it end to end."

---

## 0. Your role and operating rules

You are a senior mobile engineer and product engineer building a production-quality Android app from scratch. Work autonomously through every milestone in Section 9. Do not stop to ask questions unless you are hard-blocked (for example, missing credentials you cannot mock). When something is ambiguous, make the most practical decision, record it in `DECISIONS.md` with a one-line reason, and continue.

Rules:
- TypeScript strict mode everywhere. No `any` unless it is justified in a comment.
- After each milestone, run typecheck, lint, and tests. Fix failures before moving on. Commit with a clear message.
- Keep a running `PROGRESS.md` that lists each milestone, its status, and its known gaps.
- Use parallel sub-agents where work is independent (for example, UI screens vs. database migrations vs. seed data), but integrate and verify on the main thread.
- **Final deliverable: a signed, installable Android release APK** at `dist/mykids-tracker-v0.1.0.apk`, plus a `README.md` explaining setup, environment variables, demo logins, and how to rebuild.

---

## 1. Product context (read this carefully; it drives every decision)

**Who it's for:** Special schools and child development centres in India that deliver therapy (speech, occupational, behaviour/ABA, special education, physiotherapy, audiology support) to children with developmental needs (autism, ADHD, global developmental delay, cerebral palsy, Down syndrome, learning disabilities, hearing impairment).

**Launch scope:** 5 partner schools at launch, more being onboarded. This is a **multi-tenant** platform: one platform owner, many schools, each fully isolated.

**The problem today:**
- Schedules, progress, and resources live in Excel sheets, WhatsApp, email, and phone calls.
- **Therapists rotate.** A new or substitute therapist cannot understand the previous therapist's notes, so continuity breaks and progress is lost.
- Parents have no structured view of what happened in a session or what to practise at home.
- No one can objectively see whether a child is improving session to session.

**The core idea:** Do not track "growth percentages." **Quantify every individual therapy session** with fast, consistent, anchored ratings plus goal-level trial data. Then auto-compare each session with the last one and with a rolling average. Wrap this in a calendar, a handover system for rotating therapists, and a parent home-practice loop with short video uploads.

**Success criteria for v1:**
1. A therapist can log a full session in **under 90 seconds** on a phone.
2. A substitute therapist sees a **one-screen Handover Brief** before the session and understands the child without reading old notes.
3. A parent sees the next appointment, a plain-language session snapshot, and this week's home tasks within 2 taps of opening the app.
4. A school admin can import their existing Excel/CSV data (children, staff, parents, schedule) in one sitting.

---

## 2. Tech stack (use exactly this unless blocked; log deviations in DECISIONS.md)

- **App:** Expo (latest stable SDK) + React Native + TypeScript, **Expo Router** for navigation. Use a development build / prebuild, not Expo Go, since native modules are needed.
- **Styling:** NativeWind (Tailwind for React Native). Define design tokens in one theme file.
- **Motion:** react-native-reanimated, kept subtle. Respect the OS "reduce motion" setting.
- **State/data:** TanStack Query for server state, Zustand for local UI state.
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security, Edge Functions).
- **Offline:** expo-sqlite as a local outbox for session logs and parent logs. Writes made offline are queued and synced when the connection returns, with visible sync status.
- **Calendar UI:** react-native-calendars (month view) plus a custom day/week agenda list.
- **Charts:** react-native-gifted-charts (or victory-native if gifted-charts is blocked).
- **Media:** expo-image-picker / expo-camera for capture, react-native-compressor for client-side video compression, expo-video for playback.
- **Notifications:** expo-notifications with FCM. Scheduled local reminders plus server push from Edge Functions.
- **PDF reports:** expo-print + expo-sharing.
- **i18n:** i18next with English and Hindi. All strings go through translation keys from day one. Hindi can be machine-drafted and marked `// TODO: review` for later human review.
- **Forms/validation:** react-hook-form + zod.
- **Testing:** Jest + React Native Testing Library for units/components. Add SQL tests or a script that verifies RLS policies.

### Data access layer + Demo Mode (mandatory)
Build all data access behind a repository interface with two adapters:
- `SupabaseAdapter`: the real backend.
- `DemoAdapter`: a fully local, seeded, in-memory/SQLite dataset.

The app must run fully in **Demo Mode** with no backend credentials. A "Try demo" option on the login screen lets the user pick a role (School Admin / Therapist / Parent). This is used to pitch the app to new partner schools, so the demo data must look realistic and Indian (names, schools, cities).

If Supabase credentials are present in `.env`, the real adapter is used. Write all migrations and seed SQL regardless, so the backend can be stood up later with `supabase db push`.

---

## 3. Roles and permissions

| Role | Who | Can do |
|---|---|---|
| **Platform Admin** | App owner | Create/suspend schools, view cross-school usage metrics, manage global templates (rating scales, goal bank, resources) |
| **School Admin** | Principal / centre head | Everything within their school: staff, children, parents, schedule, settings, reports, CSV import |
| **Coordinator** | Senior therapist / clinical lead | Scheduling, substitutions, caseload assignment, review session logs, see alerts, edit goals |
| **Therapist** | Therapy staff | See own schedule + assigned children, log sessions, write notes, assign home tasks, review parent logs/videos, message parents |
| **Parent/Guardian** | Parent | See own children only: appointments, parent-visible session snapshots, goals in plain language, home tasks, upload logs/videos, message the care team, request reschedule |

Hard rules:
- **Tenant isolation is absolute.** Enforce with Postgres RLS on every table, keyed on `organization_id`. Write tests proving that a user from School A cannot read School B data.
- A parent sees only children linked to them.
- A therapist sees full clinical detail for **assigned** children. For other children in the same school they see the Handover Brief only when scheduled as a substitute for that child (time-boxed access derived from the appointment).
- Every note has a visibility flag: `internal` (staff only) or `parent_visible`. Default is `internal`.

---

## 4. Feature specification

### 4.1 Onboarding and auth
- Phone number + OTP login as the primary method (Indian parents use phone numbers, not email). Email + password as a fallback for staff. Note: Supabase phone auth needs an SMS provider (MSG91 or Twilio). Wire the config through env vars and document it. In Demo Mode, skip OTP.
- **Invite flow:** School Admin invites staff/parents by phone number. On first login, the user is auto-linked to their school and role.
- **Consent screen for parents (first login):** Plain-language explanation of what data is collected and why, a separate checkbox for video upload consent, and a link to the privacy policy. Store a timestamped consent record. Parents can withdraw video consent later, which disables uploads.
- Role-based home screen after login. A user with multiple roles or multiple children gets a switcher.

### 4.2 Child profile ("About Me": the continuity backbone)
Every child has a structured profile that any therapist can read in 30 seconds:
- Basics: name, photo, date of birth (age auto-calculated), school, class/group, assigned therapists per therapy type, primary guardian(s).
- **Communication mode:** verbal / limited verbal / non-verbal, plus tools used (sign, PECS, AAC device, gestures). Free-text notes.
- **What motivates them (reinforcers):** chips + free text (for example, bubbles, music, a specific toy, iPad time, praise).
- **Known triggers:** chips + free text (loud sounds, transitions, waiting, specific textures).
- **What calms them:** strategies that work.
- **Sensory notes:** seeking/avoiding patterns.
- **Do / Don't for therapists:** short bullet rules written by the lead therapist ("Give a 2-minute warning before transitions," "Don't touch without telling him first").
- Clinical fields (diagnosis, medical notes, allergies): visible to School Admin, Coordinator, and assigned therapists only.
- Edit history on the profile (who changed what, when).

### 4.3 Goals (per child, per therapy type)
- Goals are created from a **Goal Bank** (seeded with common goals per domain: communication, fine motor, gross motor, self-care/ADL, social interaction, behaviour, cognition/academics, sensory regulation) or written custom.
- Each goal has: domain, therapy type, target behaviour (staff wording), **parent-friendly wording** (plain language shown to parents), baseline, mastery criterion (default: 80% accuracy across 3 consecutive sessions, configurable per goal), start date, status.
- Goal status: `Not started → Emerging → Progressing → Mastered → Maintenance`, or `Paused`. Auto-suggest "Mastered" when the criterion is met; the therapist confirms.
- Mastered goals move to a "Wins" list that parents can see.

### 4.4 Calendar and appointments
- **Views:** month (dots per day colour-coded by therapy type), week, and day/agenda list.
- **Upcoming Appointment card** on the Parent and Therapist home screens: child photo, therapy type, therapist name, date, time, status chip (Confirmed / Rescheduled / Substitute assigned). Tapping opens details.
- **Recurring schedules:** for example, "Speech, Mon/Wed/Fri 10:30–11:15 with Ms. X, from date A to date B." Edit this occurrence vs. all future occurrences.
- **Therapist availability** and conflict detection (same therapist double-booked, same child double-booked). Show a clear warning before saving.
- **Attendance marking:** Present / Absent (child) / Cancelled by school / Cancelled by parent / Late (minutes). Absent and cancelled sessions count separately in reports.
- **Reschedule requests from parents:** the parent proposes up to 2 alternate slots with a reason; the coordinator approves or counter-proposes; everyone is notified.
- **Substitution flow:** when a therapist is marked unavailable for a day or range, the coordinator sees affected sessions and assigns substitutes from qualified staff. The substitute automatically gets the Handover Brief (4.6) and a notification. The parent is notified: "Today's session will be taken by Ms. Y."
- **Make-up sessions** linked to the missed session.
- **Reminders:** push 24 hours and 1 hour before (configurable per school). The therapist gets a daily 8 AM agenda push.
- Optional room/space field on appointments.

### 4.5 Session Logger (the heart of the app)
Opened from an appointment on the Today screen. Designed for speed: big tap targets, one scrollable screen, no typing required for the core score. **Do not pre-fill ratings from the last session** (that biases scoring); start blank.

**A. Session context (auto + 2 taps)**
- Auto: child, therapist, therapy type, scheduled time, whether the therapist is a substitute.
- Actual duration (default = scheduled; tap to adjust), started late (Y/N).
- Parent pre-session check-in (if submitted; see 4.8): sleep, appetite, mood at home, any change in routine/health. Shown read-only, because it explains variance.

**B. Session Snapshot: 8 anchored dimensions, scale 1–5**
Each point on each scale has a short **behavioural anchor**, shown on long-press and in a "?" sheet, so different therapists score the same way. This is what fixes the rotation problem. Seed these defaults (School Admin can edit wording, disable dimensions, and change weights):

1. **Engagement:** 1 = refused or withdrawn most of the session · 3 = participated with frequent redirection · 5 = actively participated and initiated activities
2. **Attention / Focus:** 1 = could not stay on task beyond brief moments · 3 = sustained attention for short blocks with redirection · 5 = sustained attention through full activity blocks
3. **Regulation (energy/arousal):** two inputs. *State*: Under-aroused (low energy/lethargic) / Regulated / Over-aroused (hyper/dysregulated). *Regulation score*: 1 = could not be regulated · 3 = regulated with significant support · 5 = self-regulated or stayed regulated. Note: high energy is not "good," so state is recorded separately from score.
4. **Mood / Affect:** 1 = distressed/crying most of the session · 3 = neutral/variable · 5 = happy and settled
5. **Cooperation:** 1 = did not follow instructions · 3 = followed some instructions with repetition · 5 = followed instructions readily
6. **Independence (prompt level):** the most common prompt level used. Full physical (1) / Partial physical (2) / Model or gestural (3) / Verbal (4) / Independent (5)
7. **Communication / Interaction:** 1 = no attempts · 3 = some attempts when prompted · 5 = frequent spontaneous attempts (any mode: verbal, sign, AAC, gesture)
8. **Transitions:** 1 = major difficulty/meltdown at transitions · 3 = managed with support · 5 = smooth

**C. Goal trials (for each goal targeted this session)**
- Pick from the child's active goals (show the goals planned for this session first; see "Plan for next session" below).
- Per goal: trials attempted, trials successful (stepper buttons), prompt level used, optional quick note.
- Auto-compute accuracy % per goal.

**D. Behaviour log (optional, quick)**
- Count of incidents with type chips (meltdown, aggression, self-injury, elopement, refusal, other), approximate duration, and antecedent chips (transition, demand, sensory, waiting, denied item).
- Breaks taken (count).

**E. Therapist judgement**
- "Compared to last session": Much worse / Worse / Same / Better / Much better.
- "What worked today": chips + text (feeds the Handover Brief).
- "What didn't work / triggers seen": chips + text.

**F. Structured notes (SOAP-style; keep short)**
- **S** (reported by parent/teacher): optional.
- **O** (objective): auto-generated text summary from B–D (editable).
- **A** (assessment): therapist's 1–3 line interpretation.
- **P (Plan for next session):** which goals to target and which strategy to use. **This auto-feeds the next therapist's Handover Brief.** Required field.
- Parent-facing summary: a separate short text (pre-drafted from the snapshot in plain language, editable), with visibility `parent_visible`. Only this and the snapshot visuals go to parents. Never send internal notes.
- Voice dictation works through the system keyboard. Ensure text fields support it.

**G. Save behaviour**
- Saves locally first (offline outbox), syncs when online, shows sync status.
- The log is editable for 24 hours. After that it is locked and changes require an **amendment** with a reason, kept in the audit trail.
- Unlogged sessions (attended but not logged within 24 hours) appear on the Coordinator dashboard and trigger a reminder push to the therapist.

**H. Computed metrics (calculate on save; store denormalised for fast charts)**
- **Session Score (0–100):** weighted average of enabled dimensions normalised to 0–100 (default equal weights; configurable per school).
- **Goal Accuracy:** mean accuracy across goals targeted this session.
- **Delta vs. last session** (same child, same therapy type): per dimension and overall.
- **Delta vs. rolling average of the last 4 sessions.** Show this alongside the single-session delta, because single-session comparisons are noisy.
- **Trend direction** per dimension over the last 6 sessions (up / flat / down, using simple linear regression slope with a threshold).
- **Alerts:** overall Session Score drops ≥15 points below the rolling average for 2 consecutive sessions, or 3+ behaviour incidents in a session. Notify the Coordinator and flag the child on the dashboard.
- **Substitute insight:** tag sessions run by substitutes so reports can show whether rotation affects scores.

### 4.6 Handover Brief (auto-generated, one screen)
Shown on the Therapist's Today screen for each upcoming session, and **mandatory to open (with an "I've read this" acknowledgement) when the therapist is a substitute or new to the child**. Contents:
- Photo, age, communication mode, and the top 3 Do/Don't rules.
- Reinforcers, triggers, and calming strategies (from About Me).
- **Plan for this session** (the "P" from the previous session's note).
- Active goals with current status, last accuracy %, and prompt level.
- Last 3 Session Snapshots as small sparkline rows.
- "What worked" / "What didn't" from the last 3 sessions (deduplicated chips).
- Parent check-in for today (if submitted).
- Open home tasks and the latest parent feedback.
- Any active alert.

### 4.7 Progress views
**Staff view (per child):**
- Session Score trend line (per therapy type, filterable by date range).
- Dimension radar or bar for the latest session vs. the 4-session average.
- Per-dimension sparklines.
- Goal accuracy trend per goal, with the mastery criterion line drawn on the chart.
- Attendance summary.
- Behaviour incidents over time.

**Parent view (simplified, plain language):**
- "Latest session" card: date, therapist, 3–4 key dimensions shown as friendly icons + short labels (for example, "Focus: Better than last time ↑"), plus the parent-facing summary text.
- Session history list.
- Goals in parent-friendly wording with simple status (Working on it / Getting there / Achieved).
- Wins (mastered goals).
- **Do not show parents the raw 0–100 Session Score by default** (School Admin setting to enable). Show trend arrows and words instead, because a single number invites misreading.

### 4.8 Home Practice loop (parent ↔ therapist)
- **Assign:** the therapist assigns a home activity linked to a goal, from the Resource Library or custom. Fields: title, simple steps (numbered, short), frequency (for example, 5×/week), duration, optional demo video/image, due window.
- **Parent logs:** for each task: Done / Partly / Couldn't do; how it went (Easy / OK / Hard); optional note; optional **short video (max 60 seconds)**.
- **Video handling:** compress on device to ≤720p before upload, cap at 60 s and ~25 MB post-compression, upload in the background with retry, store in a private bucket, play via short-lived signed URLs only. No public links. Videos auto-delete after a retention period (default 180 days, configurable per school).
- **Therapist review queue:** list of new parent logs/videos. The therapist reacts with a quick reply ("Great job," "Try X next time") or a text comment, which notifies the parent.
- **Parent pre-session check-in (optional, 15 seconds):** sent the morning of a session. Sleep (Good/OK/Poor), ate breakfast (Y/N), mood (3 faces), any change in routine/health (Y/N + note). Feeds the Session Logger context.
- **Weekly home-practice completion %** per child, visible to staff and parents.

### 4.9 Resource Library
- Per school, plus global (platform-provided) resources: PDFs, images, videos, links.
- Tag by therapy type, domain, age band, and goal.
- Therapists can attach resources to home tasks or share directly with a parent.
- Parents see only resources shared with them, plus school-wide "Parent Resources."

### 4.10 Messaging and announcements (replace scattered WhatsApp)
- **Per-child care-team thread:** parent(s) + assigned therapists + coordinator. Text, images, and attachments. Read receipts. This keeps every conversation about a child in one place that survives staff rotation.
- **Staff-only thread per child** for internal discussion.
- **School announcements:** admin to all parents / all staff / a specific group (for example, a holiday notice or event).
- Quiet hours setting (no message push between 9 PM and 8 AM by default, except urgent schedule changes).

### 4.11 Dashboards
**Therapist "Today":** today's sessions in time order, each with a brief button, a log button, and status (Upcoming / In progress / Logged / Not logged). Counters: pending parent reviews, unread messages.

**Coordinator/School Admin dashboard:**
- Today: sessions scheduled / completed / logged / unlogged / cancelled.
- This week: attendance rate, logging compliance per therapist, home-practice completion rate.
- **Children needing attention:** active alerts and declining trends.
- Upcoming substitutions and pending reschedule requests.
- Therapist workload (sessions per therapist this week).

**Platform Admin:** list of schools with active children, sessions logged this month, active parents %, last activity date. Create school + first School Admin invite.

### 4.12 Reports and export
- **Child Progress Report PDF** (monthly or custom date range): school header/logo, child details, attendance, Session Score trends per therapy type, goal progress table, wins, therapist summary paragraph (editable before export), home-practice completion. Use this for parent meetings and IEP reviews. Two versions: Staff (full) and Parent (simplified).
- **Excel/CSV export** for admins: sessions, attendance, scores per child or per therapist for a date range.

### 4.13 CSV / Excel import (critical for onboarding schools off Excel)
- Admin picks a CSV/XLSX file via the document picker. Supported imports: Children, Staff, Parents (with child linking), Recurring Schedule.
- Provide downloadable template files with exact column headers.
- Flow: upload → column-mapping screen (auto-map by header name, allow manual remap) → validation preview (row-level errors highlighted: missing phone number, duplicate child, unknown therapist name) → import valid rows → summary.
- Imports are idempotent on a natural key (for example, child name + DOB + school) to avoid duplicates on re-import.

### 4.14 School settings
- School name, logo, address, contact number (shown in the app for that school's users; light white-labelling).
- Therapy types offered (from defaults plus custom).
- Rating dimensions: enable/disable, edit anchors, set weights.
- Reminder timings, quiet hours, video retention days, whether parents see the numeric Session Score.
- Working hours and holidays (block the calendar).

### 4.15 Notifications (push + in-app inbox)
Appointment reminder · appointment changed/cancelled · substitute assigned · reschedule request and response · new parent-visible session summary · new home task · parent log/video submitted (to therapist) · therapist feedback on log (to parent) · unlogged session reminder · alert on child (to coordinator) · new message · announcement. Each user can mute categories, except schedule changes.

---

## 5. Data model (Postgres; create as Supabase migrations)

Every tenant table has `organization_id uuid not null` + RLS. All tables get `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`, `created_by`.

- `organizations` (schools): name, logo_url, settings jsonb, status
- `branches` (optional, a school may have multiple centres)
- `profiles`: user_id (auth), full_name, phone, email, avatar_url, preferred_language
- `memberships`: user_id, organization_id, role enum (platform_admin, school_admin, coordinator, therapist, parent), status
- `therapy_types`: org, name, colour, icon
- `children`: org, branch, full_name, dob, photo_url, class_group, status
- `child_profiles`: child_id, communication_mode, comm_tools[], reinforcers[], triggers[], calming[], sensory_notes, dos[], donts[], clinical jsonb (restricted)
- `child_guardians`: child_id, user_id, relation, is_primary
- `child_therapists`: child_id, user_id, therapy_type_id, is_lead, active_from, active_to
- `goal_bank` (global + per org): domain, therapy_type, staff_text, parent_text
- `goals`: child_id, therapy_type_id, domain, staff_text, parent_text, baseline, mastery_rule jsonb, status, mastered_at
- `appointment_series`: recurrence rule (RRULE string), child, therapist, therapy_type, start/end time, date range
- `appointments`: series_id nullable, child_id, therapist_id, original_therapist_id (for substitution), therapy_type_id, starts_at, ends_at, room, status enum, attendance enum, late_minutes, makeup_of nullable
- `reschedule_requests`: appointment_id, requested_by, proposed_slots jsonb, reason, status, resolution
- `therapist_unavailability`: user_id, from, to, reason
- `rating_dimensions`: org, key, label, anchors jsonb (1–5), weight, enabled, sort_order
- `sessions`: appointment_id (unique), child_id, therapist_id, therapy_type_id, is_substitute, actual_minutes, started_late, regulation_state, compared_to_last enum, worked_tags[], worked_text, not_worked_tags[], not_worked_text, session_score numeric, goal_accuracy numeric, delta_last numeric, delta_rolling numeric, locked_at
- `session_ratings`: session_id, dimension_key, value int 1–5
- `goal_trials`: session_id, goal_id, attempted, successful, prompt_level, note
- `behaviour_incidents`: session_id, type, duration_seconds, antecedent_tags[]
- `session_notes`: session_id, subjective, objective, assessment, plan_next, parent_summary
- `amendments`: entity, entity_id, field, old_value, new_value, reason, by, at
- `parent_checkins`: child_id, appointment_id, sleep, ate, mood, change_flag, change_note
- `home_tasks`: child_id, goal_id, assigned_by, title, steps jsonb, frequency_per_week, duration_minutes, resource_id, active_from, active_to, status
- `home_logs`: task_id, child_id, logged_by, outcome enum, difficulty enum, note, media_id, reviewed_by, review_reaction, review_comment, reviewed_at
- `media`: org, owner, bucket_path, kind, duration_s, size_bytes, expires_at
- `resources`: org nullable (null = global), title, kind, url/path, tags[], audience enum
- `resource_shares`: resource_id, child_id or user_id
- `threads`: org, child_id nullable, kind enum (care_team, staff_only, announcement), title
- `thread_members`, `messages` (thread_id, sender_id, body, attachments jsonb), `message_reads`
- `alerts`: org, child_id, kind, payload, status, resolved_by
- `notifications`: user_id, kind, payload, read_at
- `push_tokens`: user_id, token, platform
- `consents`: user_id, child_id, kind (data_processing, video_upload), granted bool, at, version
- `audit_log`: actor, action, entity, entity_id, at, meta

Add indexes for: appointments by (therapist_id, starts_at) and (child_id, starts_at); sessions by (child_id, therapy_type_id, created_at desc).

Compute the session metrics in a Postgres function or Edge Function triggered on session insert/update (single source of truth). Mirror the same logic in a shared TS module for offline display, with unit tests that confirm both produce identical numbers on fixtures.

---

## 6. Screens and navigation

**Parent (bottom tabs):** Home · Calendar · My Child · Home Practice · More
- Home: greeting, Upcoming Appointment card, Latest Session card, Home tasks due this week, check-in prompt (on session days), announcements.
- Calendar: month + agenda, appointment detail, request reschedule.
- My Child: profile header, tabs → Sessions / Goals / Wins / Reports. Child switcher if there are multiple children.
- Home Practice: task list → task detail → log + video upload; feedback received.
- More: Messages, Resources, Notifications, Language (EN/हिंदी), Consent & Privacy, Contact school, Logout.

**Therapist (bottom tabs):** Today · Calendar · Caseload · Reviews · More
- Today: agenda with Brief + Log buttons per session.
- Session Logger (full-screen modal flow, Section 4.5).
- Caseload: assigned children → child workspace (About Me, Goals, Sessions, Progress charts, Home tasks, Notes, Messages).
- Reviews: parent logs/videos queue.
- More: Messages, Resources, Availability/leave, Notifications, Settings.

**Coordinator / School Admin (bottom tabs):** Dashboard · Schedule · People · Reports · More
- Schedule: calendar across all therapists (filter by therapist/child/therapy type), create series, substitutions, reschedule requests.
- People: Children, Staff, Parents, Invites, CSV import.
- Reports: child PDF, exports.
- More: School settings, rating dimensions editor, goal bank, resources, announcements.

**Platform Admin:** Schools list, school detail, create school, global templates.

---

## 7. Design direction

- **Calm, low-stimulation UI.** The users are parents of children with developmental needs and busy therapists. Avoid the multi-colour "rainbow" look common in kids' apps. Use a neutral warm-white background, one deep navy primary (placeholder `#1E2A5A`), one soft accent (placeholder teal `#2BA59A`), and muted, distinguishable colours per therapy type, used only as small markers and chips.
- Brand is a placeholder (name and logo will change). Centralise the app name, colours, and logo in `src/theme` and `app.config.ts` so rebranding is a one-file change.
- Typography: one clean sans (Inter or system), large readable sizes. Minimum 16 px body text in parent views.
- Big touch targets (min 48 dp), especially in the Session Logger. Logger rating rows are 5 large tappable pills with the anchor text visible under the selected value.
- Icons plus words, never icons alone (some parents have limited literacy or use Hindi).
- Friendly illustration only in empty states; nowhere else.
- Subtle motion: card entrance fades, progress bar fills, sync status. No bouncing or confetti, except a small, restrained "Goal mastered" moment.
- Full light and dark theme support. Accessibility labels on all interactive elements; respect font scaling.
- Skeleton loaders, empty states with a clear next action, and friendly error states with retry.

---

## 8. Non-functional requirements

- **Privacy and children's data (India, DPDP Act 2023):** record verifiable parental consent before processing a child's data; collect only what the features need; no third-party analytics or ad SDKs that track users; provide "Request data deletion" and "Download my child's data" actions (they can create admin tasks in v1); keep an audit log of clinical record edits. Add a `PRIVACY_NOTES.md` listing what data is stored where, for the owner's legal review. Do not claim legal compliance in the UI.
- **Hosting:** document that the Supabase project should be created in the Mumbai (ap-south-1) region.
- **Security:** RLS on every table; private storage buckets; signed URLs with short expiry; no secrets in the repo; the Supabase service role key never ships in the app.
- **Performance:** the Today screen and parent Home load in <1.5 s on a mid-range Android phone with cached data; paginate long lists; lazy-load charts.
- **Offline:** Session Logger, parent home-log text, and check-ins work offline and sync later. Video uploads queue and retry on Wi-Fi/mobile data (setting: "Upload videos on Wi-Fi only," default off).
- **Reliability:** global error boundary; optional Sentry via env var (disabled if not set).
- **Min Android version:** API 26 (Android 8.0).

---

## 9. Milestones (execute in order; verify each before continuing)

**M0: Scaffold.** Expo + TS + Expo Router + NativeWind + i18n + theme tokens + repository interface with Demo and Supabase adapters. `DECISIONS.md`, `PROGRESS.md`, `.env.example`.

**M1: Auth, tenancy, roles.** Supabase migrations for core tables + RLS. Phone OTP + email fallback. Invite flow. Role-based navigation. Demo Mode role picker. **RLS test script proving cross-school isolation and parent/therapist scoping.**

**M2: Seed data.** Realistic demo dataset: 2 schools (for example, one in Noida, one in Bengaluru), 1 school admin + 1 coordinator + 4 therapists per school, 12 children per school with complete About Me profiles and 2–4 goals each, 15 parents, 8 weeks of past appointments with logged sessions showing believable trends (some improving, one declining with an alert, a few substitute sessions), upcoming 4 weeks of recurring appointments, home tasks with logs, 3 placeholder videos, resources, message threads. Indian names and context. Same data powers the DemoAdapter and `supabase/seed.sql`.

**M3: Child profile + goals + goal bank.**

**M4: Calendar + appointments.** Recurrence, conflicts, attendance, reschedule requests, substitution flow, reminders.

**M5: Session Logger + metrics engine + Handover Brief.** Includes offline outbox, 24-hour lock + amendments, alerts, and unit tests for every metric calculation (Session Score, deltas, rolling average, trend slope, mastery detection, alert triggers).

**M6: Progress views** (staff + parent) with charts.

**M7: Home Practice loop.** Tasks, parent logs, video capture/compress/upload, review queue, check-ins.

**M8: Messaging, announcements, notifications** (push + inbox + quiet hours).

**M9: Dashboards** (Therapist Today, Coordinator/Admin, Platform Admin).

**M10: Reports + exports + CSV/XLSX import** with templates, mapping, validation, and idempotency.

**M11: Polish.** Hindi strings, accessibility pass, dark mode, empty/error states, performance check, app icon + splash (placeholder brand).

**M12: Build the APK.**
- Configure `app.config.ts`: name "My Kid's Tracker", package `com.mykidstracker.app` (placeholder, configurable), versionCode 1, versionName 0.1.0.
- Generate a release keystore **outside the repo** (or via env-provided path), document how to back it up, and never commit it.
- Preferred: `npx expo prebuild --platform android --clean` then `cd android && ./gradlew assembleRelease` (requires JDK 17 + Android SDK; install them if the environment allows, and document versions).
- Fallback if a local Android SDK is unavailable: configure `eas.json` with a `preview` profile using `"android": { "buildType": "apk" }` and run `eas build -p android --profile preview`. If EAS login is required and not available, stop at this step and give the exact command for the owner to run.
- Copy the output to `dist/mykids-tracker-v0.1.0.apk`. Verify it with `aapt dump badging` or equivalent and report package name, version, min SDK, and file size.
- The APK must open in Demo Mode with no backend configured.

**M13: Handover docs.** `README.md` (setup, env vars, Supabase setup steps, demo logins, build steps), `PRIVACY_NOTES.md`, `CSV_TEMPLATES/` folder, and a short `TEST_PLAN.md` with manual QA scripts per role.

---

## 10. Out of scope for v1 (do not build; keep the architecture ready)
- AI-generated session summaries and parent-friendly rewrites (planned via Claude API in v2; leave a `summaries` service stub).
- iOS build (keep code cross-platform; do not use Android-only APIs without a fallback).
- Web admin panel (Expo web export can come later).
- Billing, invoicing, and fee collection.
- Video calls / teletherapy.
- AAC board features.

---

## 11. Definition of done
- All milestones are marked complete in `PROGRESS.md`, with known gaps listed honestly.
- Typecheck, lint, and tests pass. RLS isolation tests pass.
- The APK installs on Android 8+ and launches, and all three demo roles can complete their core flows:
  - Parent: see the next appointment → open the latest session → log a home task with a video → message the care team.
  - Therapist: open the Today screen → read a Handover Brief → log a full session in under 90 s → review a parent video.
  - School Admin: import a CSV → create a recurring schedule → assign a substitute → export a child PDF report.
- Final message to the owner: what was built, how to install the APK, how to connect the real Supabase backend, and the top 5 recommended next steps.
