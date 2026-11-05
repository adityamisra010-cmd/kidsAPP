# Import templates

These files show the columns the app reads when a school moves its Excel sheets into the app
(**People → Import from Excel**, or `/import`). The same templates can be downloaded from the
app itself. You can also import your own sheet: the app matches your column names to these
(for example "Student Name", "Name of child" or "Child Name" all work for *Full Name*), and you
can change any match before importing.

**Suggested order:** Staff → Children → Parents → Schedule. Parents and the schedule refer to
children and therapists by name, so those need to be in the app first.

**Files:** `.xlsx`, `.xls` or `.csv` (comma, semicolon or tab separated, UTF-8 for Hindi names).
The first sheet that has data is used. A title row above the column names is fine. Rows that are
completely empty, or only have a serial number, are ignored. Up to 3,000 rows per file.

**Re-importing is safe.** Each file is matched on a natural key, so importing the same (or an
updated) file again updates existing records instead of creating duplicates:

| File | Matched on |
|---|---|
| staff.csv | Mobile number |
| children.csv | Full name + date of birth |
| parents.csv | Mobile number (one row per child; the same number on two rows links both children) |
| schedule.csv | Child + therapist + therapy type + day + start time |

Rows with problems are listed with a plain reason ("Row 12: the mobile number has 9 digits") and
are skipped; the rest are imported. Fix the skipped rows in your file and import it again.

## Accepted formats

- **Mobile numbers:** Indian mobiles only, any common style: `+91 98765 43210`, `098765-43210`,
  `9876543210`. Landlines can't be used to sign in. If a cell has two numbers, the first is used.
  If Excel shows a number like `9.88E+09`, format the column as *Text* and type the numbers again.
- **Dates:** `14/03/2019`, `14-03-2019`, `14.03.2019`, `2019-03-14`, `14 Mar 2019`, `March 14, 2019`
  or a real Excel date cell. Day comes first (Indian style); `03/25/2019` is read as 25 March.
- **Times:** `10:30`, `10:30 AM`, `10.30 am`, `2 pm`, `14:00`, or a range like `10:30 - 11:15`
  (the range also gives the duration). `1:00`–`6:59` without AM/PM is read as afternoon.
- **Days:** `Mon/Wed/Fri`, `M W F`, `MWF`, `Monday, Wednesday`, `Mon-Fri`, `Tue & Thu`, `Daily`
  (Monday to Saturday), `Weekdays` (Monday to Friday). `T` = Tuesday, `Th` = Thursday,
  `S` = Saturday, `Su` = Sunday.
- **Names:** matched without caring about capitals, extra spaces or titles (Ms., Mr., Dr., Smt.).
  When a name isn't found, the app suggests the closest match ("Did you mean Priya Nair?") and
  you can accept it in the app without editing the file.

## children.csv

| Column | Required | Notes |
|---|---|---|
| Full Name | Yes | As on school records. |
| Preferred Name | No | What the child likes to be called. Shown to therapists. |
| Date of Birth | Yes | Used with the name to recognise the same child on re-import. |
| Gender | No | Male / Female / Other (also M, F, Boy, Girl). |
| Class or Group | No | Class, section or programme, e.g. "Lotus (Primary)". |

## staff.csv

| Column | Required | Notes |
|---|---|---|
| Full Name | Yes | Titles like "Dr." are kept as typed. |
| Mobile Number | Yes | Used to sign in with an SMS code, and to recognise the same person. |
| Email | No | Optional sign-in by email. |
| Role | No | Therapist, Coordinator or School Admin (Principal / Centre Head also work). If empty, the job title is used, otherwise Therapist. |
| Job Title | No | Shown under the name, e.g. "Speech Therapist". |
| Therapy Types | No | One or more, separated by `;` or `,`. Short names work: Speech, OT, ABA, Special Ed, Physio, Audiology. |

## parents.csv

| Column | Required | Notes |
|---|---|---|
| Parent Full Name | Yes | |
| Mobile Number | Yes | The parent signs in with this number. |
| Email | No | |
| Relation | No | Mother, Father, Grandmother, Guardian… Empty means "Parent". |
| Child Full Name | Yes | Must match a child already in the app. |
| Child Date of Birth | No | Only needed when two children have the same name. |
| Primary Contact | No | Yes / No. If empty, the first parent listed for a child is the primary contact. |

## schedule.csv

| Column | Required | Notes |
|---|---|---|
| Child Full Name | Yes | Must match a child already in the app. |
| Child Date of Birth | No | Only needed when two children have the same name. |
| Therapist | Yes | Name or mobile number of a therapist already in the app. |
| Therapy Type | Yes | e.g. Speech Therapy, OT, ABA. |
| Days | Yes | See *Days* above. |
| Start Time | Yes | See *Times* above. |
| Duration (minutes) | No | 10–240. `1 hr`, `1.5 hours` and `45 min` also work. Default 45. |
| Start Date | No | Default today. Past dates start from today (sessions are never created in the past). |
| End Date | No | Default 31 March (end of the Indian academic year). |
| Room | No | |
