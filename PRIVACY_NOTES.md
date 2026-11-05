# Privacy notes (for legal review)

This document describes, in technical terms, what personal data My Kid's Tracker stores, where,
who can access it, and how long it is kept. It is written for the owner's legal counsel. **It is
not legal advice and does not state that the product complies with the Digital Personal Data
Protection Act, 2023 (DPDP Act), the DPDP Rules, or any other law.** Points that need a legal
decision are marked **Counsel:**.

Status: describes the backend as built in `supabase/migrations/` (database, file storage,
scheduled jobs). Statements about the phone app are based on the product design and must be
confirmed against the final app build.

---

## 1. Who is involved

| Party | Role in the system |
|---|---|
| Platform owner | Operates the app and the Supabase project. Creates schools. Sees school-level counts only (no child records). |
| School / centre | Enrols children, employs staff, decides what is recorded. |
| Staff (school admin, coordinator, therapist) | Record and use children's data for therapy. |
| Parent / guardian | Gives consent, sees their own child's parent-facing data, uploads practice logs and videos. |
| Children | The people most of the data is about. They do not have accounts. |

**Counsel:** decide who is the Data Fiduciary for children's records (the school, the platform
owner, or both jointly) and whether the platform owner is a Data Processor for the schools.
This determines the contracts needed (owner ↔ school data processing agreement) and who answers
parents' requests.

## 2. Where data is hosted and which services see it

| Service | What it receives | Location |
|---|---|---|
| Supabase (PostgreSQL database, authentication, file storage, Edge Functions) | All data in this document | Project to be created in the **Mumbai region (AWS ap-south-1)**. Supabase staff may access it for support under Supabase's terms. |
| SMS provider for login codes (MSG91, Twilio or Textlocal; to be chosen) | Phone number and a one-time code | Depends on provider (Twilio: outside India). |
| Expo push service and Google Firebase Cloud Messaging | Device push token and the notification title/text | Outside India. |
| Sentry (crash reporting) | Not active. Only if the owner later sets a DSN. | — |

No third-party analytics, advertising or tracking SDKs are included. Push text normally names the
child (first name) and the event ("Riya's Speech Therapy session tomorrow at 10:30 AM"); setting
`PUSH_PRIVACY_MODE=generic` on the push function replaces it with "You have a new update" so no
child detail leaves Supabase through push.

**Counsel:** cross-border transfer of phone numbers (SMS) and notification text (Expo/FCM);
whether the generic push mode should be the default.

## 3. What is stored, and where

All tables are in the Supabase PostgreSQL database (`public` schema). Files are in Supabase
Storage buckets, all **private** (no public links; the app plays files through short-lived signed
URLs).

| Category | Examples | Where |
|---|---|---|
| Accounts and contact details | Name, phone, email, photo, preferred language, job title | `auth.users` (managed by Supabase Auth: phone, email, sign-in times), `profiles`, `memberships` (role per school) |
| Invitations | Name, phone/email and relation of people invited before they sign up; children to link | `invites` |
| Child identity | Full and preferred name, date of birth, gender, photo, class/group, branch | `children`; photos in the `avatars` bucket |
| "About Me" (care profile) | Communication mode and tools, motivators, triggers, calming strategies, sensory notes, do/don't rules | `child_profiles` |
| **Health / clinical information** | Diagnosis, medical notes, allergies, medications | `child_clinical` (kept in a separate table so access can be restricted) |
| Therapy goals | Goal wording (staff and parent versions), baseline, mastery rule, status | `goals`, `goal_bank` (templates, not personal) |
| **Session records** | Ratings (1–5) on behaviour/engagement dimensions, computed scores and trends, goal trial counts, behaviour incidents (type, duration, antecedents), therapist notes (subjective, objective, assessment, plan), a parent-facing summary | `sessions`, `session_ratings`, `goal_trials`, `behaviour_incidents`, `session_notes` |
| Corrections | Every change to a locked session log: field, old value, new value, reason, who, when | `amendments` |
| Alerts | "Score dropped", "3+ incidents", "session not logged" | `alerts` |
| Schedule | Appointments, recurring series, attendance, cancellations and reasons, reschedule requests, staff leave | `appointments`, `appointment_series`, `reschedule_requests`, `therapist_unavailability`, `brief_acknowledgements` |
| Home practice | Tasks, parent logs (done/partly/couldn't, difficulty, note), therapist feedback | `home_tasks`, `home_logs` |
| **Videos and photos from home** | Short videos (≤60 s) of the child practising at home, possibly showing the home and family members | `media` (metadata: owner, child, size, duration, expiry) and the `media` bucket at `{school}/{child}/{file}` |
| Parent check-ins | Sleep, breakfast, mood, change in routine/health (with note) on session days | `parent_checkins` |
| Messages | Care-team and staff-only threads per child, direct threads, read receipts, school announcements | `threads`, `thread_members`, `messages`, `message_reads`, `announcements` |
| Notifications | In-app inbox, delivery status, device push tokens, muted categories | `notifications`, `push_tokens`, `notification_mutes` |
| Consent | Data-processing and video-upload consent per parent and child: granted yes/no, time, consent text version | `consents` (append-only) |
| Privacy requests | Export / deletion requests and their status | `data_requests` |
| Audit trail | Who changed which clinical record and which fields (values are not copied) | `audit_log` |
| About Me edit history | Old and new value of each About Me / clinical field change, who and when | `profile_edits` |
| Resources | Documents and links shared by the school (not normally personal) | `resources`, `resource_shares`, `resources` bucket |
| School details | Name, address, phone, logo, settings | `organizations`, `branches`, `org-assets` bucket |

**On the phone (by design; confirm against the app build):** login session tokens in the
device's secure storage; an offline queue (SQLite) holding session logs, parent logs and
check-ins until they sync; videos compressed on the device and kept in the app's cache until
uploaded; cached screens for fast loading. Demo Mode uses built-in fictional data only.

## 4. Who can see what

Access is enforced inside the database (PostgreSQL Row Level Security on every table, and
equivalent rules on every storage bucket), not only by the app's screens. An automated test
suite (`npm run test:db`) checks these rules on every run, including that users of one school
cannot read a single row of another school.

| Role | Can see |
|---|---|
| Platform admin | List of schools and counts (active children, staff, sessions this month, % active parents, last activity). **No** child, parent, session, message or file data. |
| School admin, coordinator | Everything belonging to their own school, including clinical information and therapist notes. |
| Therapist, for children assigned to them | Full record: About Me, clinical information, goals, all session records and notes, home practice, messages. |
| Therapist covering a session (substitute) | From 24 h before until 24 h after that appointment only: About Me (without clinical information), goals, recent session ratings and summaries, "what worked", alerts, home tasks with the parent's practice logs and videos, and the check-in (the "Handover Brief"). No clinical information, no therapist notes. Access ends automatically. |
| Other therapists in the school | The child's name and photo only if they are on one of the child's appointments (for their calendar); otherwise nothing. |
| Parent / guardian | Only children linked to them: profile and About Me (without clinical information), appointments, parent-friendly goal wording, home tasks and their own logs and videos, care-team messages, and a **parent snapshot** of each session (selected ratings shown as words, the parent summary, goals worked on). The 0–100 score only if the school turns it on. Never: therapist notes, clinical information, staff-only threads, alerts, incident details, audit trail. |
| Scheduled server jobs | Use a service key that bypasses these rules, limited to sending notifications, reminders, and deleting expired videos. This key is never in the app. |

Contact details (name, phone, email in `profiles`): school admins and coordinators see every
member of their school; therapists see colleagues and the guardians of children they work with;
parents see their child's therapists, the school's admins and coordinators, and co-guardians.

Session logs can be edited for 24 hours (school setting); after that every change requires a
written reason and is stored in `amendments`.

**Counsel:** whether staff phone numbers should be visible to parents at all (they currently
are, for the people listed above).

## 5. Retention and deletion

| Data | Current behaviour |
|---|---|
| Home videos/photos (`media`) | Deleted automatically after **180 days** (school setting `videoRetentionDays`) by a daily job; files with no database record (e.g. after a child is deleted) are also removed. |
| Everything else | Kept while the school keeps the child's record. **No automatic deletion yet.** |
| Deleting a child | Deletes, in one step, the child's profile, clinical record, edit history, goals, appointments, session records and notes, amendments, home practice, check-ins, alerts, message threads, consents and requests for that child; video files are removed by the next daily job. **Not removed:** notifications already delivered to users (their text may contain the child's first name) and audit-trail entries (field names only, no values). |
| Notifications | Kept until the user deletes them. No automatic clean-up yet. |
| Backups | Supabase keeps database backups for a period that depends on the plan (typically 7 days or more). Deleted data remains in backups until they expire. |

**Counsel:** set retention periods for (a) children who leave a school, (b) clinical and session
records (professional record-keeping duties may require keeping them for a minimum time), (c)
audit trail and edit history, (d) notifications and messages, (e) accounts of parents with no
remaining linked child. These can then be implemented as scheduled jobs.

## 6. Consent records

- On first login the parent app shows a consent screen (plain-language explanation, separate
  checkbox for video upload, link to the privacy policy).
- Each decision is stored as a new row in `consents`: who (parent account), which child, which
  kind (`data_processing` or `video_upload`), granted or not, timestamp, and the version of the
  consent text. Rows are never edited or deleted by the app, so the history is preserved.
  Withdrawing consent adds a new row with `granted = false`.
- **Enforced on the server:** while a parent's latest video-upload consent is not granted, the
  database and storage refuse their video uploads.
- The parent's identity is tied to a phone number verified by one-time SMS code and to the
  school's invitation that linked them to the child. Unverified phone numbers/emails cannot claim
  an invitation.
- Not yet enforced on the server: blocking all processing until `data_processing` consent is
  given. Schools create child records (e.g. by spreadsheet import) before parents first log in.

**Counsel:** whether this is "verifiable consent" of a parent/lawful guardian for a child under
Section 9 of the DPDP Act and the Rules; the legal basis for records the school creates before the
parent consents; whether exemptions for educational institutions or healthcare providers apply to
the therapy records and behaviour logging; the content of the notice and privacy policy.

## 7. Requests to export or delete a child's data

1. In the parent app: "Download my child's data" or "Request data deletion" creates a
   `data_requests` row (open). The school admin sees open requests in the app.
2. v1 is manual: the school admin prepares the export (child progress report PDF and
   spreadsheet exports) or deletes the child record (see section 5), then marks the request done.
3. Every request and status change is stored with timestamps.

Not yet built: a one-click machine-readable export bundle, identity re-verification before
fulfilling a request, response-time tracking, and a grievance contact shown in the app.

**Counsel:** response deadlines, the grievance officer / contact to publish, and what must be
kept despite a deletion request.

## 8. Security measures (summary)

- Hosting in Mumbai; encrypted connections; database encryption at rest provided by Supabase.
- Row Level Security on every table and storage bucket; tested automatically, including school-to-school isolation.
- Private storage only; videos limited to 25 MB and 60 s; short-lived signed URLs for playback.
- Clinical information in a separate, more restricted table.
- Locked session logs with a reasoned amendment trail; audit log of clinical record changes.
- No secrets in the code repository; the service key is used only by server jobs.
- Login by one-time SMS code (parents) or email + password with confirmation (staff).

Not yet in place: breach detection/alerting, documented incident-response procedure, staff
access reviews, encryption of the on-device offline queue (to be confirmed in the app).

**Counsel:** breach notification duties (to the Data Protection Board and affected parents)
and the contracts/terms needed with Supabase, the SMS provider and Expo.

## 9. Things deliberately not done

- No advertising, no third-party analytics, no tracking across apps or websites.
- No selling or sharing of data with anyone outside the school and the providers in section 2.
- No automated decisions about a child: scores, trends and alerts are prompts for staff, who decide.
- No AI processing of notes in this version.
