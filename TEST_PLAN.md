# Manual test plan (v0.1.0)

Install `mykids-tracker-v0.1.0.apk` on an Android 8+ phone:
1. Open the file and allow "Install unknown apps" when asked.
2. Open the app, tap **Try the demo** and pick a role.

Use **More → Switch demo role** to move between roles. Data entered as one role stays visible to the others until the app restarts.

Mark each step ✅ / ❌ and note anything confusing, slow, or worded oddly. Wording problems are useful findings.

## 1. Parent — Priya Sharma (core flow)
1. Home loads in under 2 seconds. You see:
   - a greeting by name
   - a child switcher (Aarav / Anaya)
   - the morning check-in prompt
   - **Next appointment** with a status chip
   - **Latest session**: words and arrows only, no 0–100 score
   - **This week's practice**
   - a school notice
2. Tap the check-in. Answer the 4 questions in about 15 seconds and submit. The thank-you screen names the therapist.
3. Open **Latest session**. It shows plain-language highlights, the therapist's message and the goals worked on. There are no internal notes.
4. **Practice** tab: open a task → **Log practice** → choose Done / OK → **Record video** (keep it under 60 seconds) → submit.
   - Expected: "Saved. The video will upload in the background."
5. **Calendar** tab:
   - Month view shows coloured dots.
   - The List view has Upcoming and Past.
   - Open an appointment → **Request a change** → propose 2 slots and a reason → submit.
6. **My Child** tab: check Sessions, Goals (status in words), Wins, Progress (Weekly / Monthly / Quarterly, words and arrows) and About.
7. **More → Messages**: open the care team thread and send a message.
8. Switch the child to Anaya. Home, Practice and My Child all update.
9. **More → Language → हिंदी**. Labels switch to Hindi; note any untranslated or awkward text.

## 2. Therapist — Riya Menon (core flow)
1. **Today** shows the sessions in time order, with counters (Reviews waiting, Unread messages, Not logged) and a sync badge.
2. Find the session marked **Substitute / Brief required**. **Log** is disabled with "Read the brief first".
3. Open **Brief**. In under 30 seconds you should understand:
   - how the child communicates
   - the top Do / Don't rules
   - what motivates them and what calms them
   - **Plan for this session**
   - goals and the last 3 sessions
   Tap **I've read this**. **Log** is now enabled.
4. **Log a full session and time it (target: under 90 seconds).**
   - Rate all 8 dimensions.
   - Pick the energy state.
   - Set tries and correct counts for 1 goal.
   - Tap one "What worked" chip.
   - Fill in **Plan for next session**.
   - Save.
   - Expected: "Session saved" with the score, the change vs last session and the change vs the 4-session average.
5. Long-press a rating number, or tap "What do 1–5 mean?". The descriptions for each score are shown.
6. **Reviews** tab: open a parent video, play it, react with "Great job", add a comment and turn on "Use in next session".
7. Switch to **Parent** (Priya). The new session summary and the therapist's feedback appear.
8. Turn on **Airplane mode** and log another session. It saves on the phone with a "waiting to sync" badge. Turn Airplane mode off and it syncs.
9. **Caseload**: open a child. Check About Me, Goals (confirm a "Mastery reached" suggestion if one appears), Sessions and the Progress charts.

## 3. School Admin — Sunita Bansal (core flow)
1. **Dashboard** shows:
   - today's counts
   - children needing attention (one with a score-drop alert, one with an incident alert)
   - sessions not logged yet
   - cover needed
   - reschedule requests
   - weekly rates
   - therapist workload
2. **Import** (People → Import, or More → Import from Excel):
   - **Download template** for Children, fill in 2 rows in Excel or Google Sheets, then **Import file**.
   - Check that columns match automatically.
   - The preview flags any bad rows with plain reasons.
   - Import, and see the summary.
   - Re-import the same file: rows update instead of duplicating.
3. **Schedule → New schedule**:
   - Pick a child, therapy, therapist, Mon / Wed / Fri, 10:30, 45 min and a date range.
   - Clash warnings appear before saving.
   - Save.
4. **Substitutions**: for a session that needs cover, **Choose cover**, then pick a therapist marked "Free at this time".
   - Expected: confirmation that the parent and the substitute were notified.
5. **Reports**:
   - Choose a child, Last month, "For parents" → **Preview** → edit the summary → **Create PDF** → share.
   - Check the PDF: school header, attendance, trends in words, goals, wins.
6. **Reschedule requests**: approve one request, counter-propose another.
7. **More → School settings / Rating scales**: edit a score description and the change shows up in the session logger.

## 4. Coordinator — Dr. Meera Iyer
1. **Alerts**: acknowledge one alert, resolve another.
2. Add leave for a therapist under **Availability & leave**. The affected sessions appear under **Substitutions**.

## 5. Platform Admin — Kabir Anand
1. The schools list shows both schools with active children, sessions this month and the share of active parents.
2. **Add school** creates a school plus an invite for its first admin.

## 6. General checks
- **Dark mode**: switch the phone to dark mode. All screens stay readable.
- **Large text**: set Android font size to the maximum. Text wraps instead of being cut off, and buttons stay tappable.
- **TalkBack**: buttons and chips are announced with clear labels, and status is never shown by colour alone.
- **Performance**: Today and parent Home open in under 1.5 seconds on a mid-range phone.
- **No crashes**: if anything fails, note the screen and what you tapped.
