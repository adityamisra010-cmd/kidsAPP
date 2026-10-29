/**
 * Template columns for each import kind.
 *
 * `key` is the contract with the adapters: `ImportRow.values` is keyed by these keys (plus the
 * derived keys listed in DERIVED_KEYS). `header` is the exact header in CSV_TEMPLATES/<kind>.csv.
 * `synonyms` are compared after `normalizeHeader`, so write them lower-case without punctuation.
 */
import type { ImportKind } from '@/domain/types';

export type ColumnType =
  | 'name'
  | 'text'
  | 'phone'
  | 'email'
  | 'date'
  | 'time'
  | 'weekdays'
  | 'role'
  | 'gender'
  | 'yesno'
  | 'duration'
  | 'relation'
  | 'therapyTypes'
  | 'therapyType'
  | 'child'
  | 'therapist';

export interface ImportColumn {
  key: string;
  header: string;
  required: boolean;
  type: ColumnType;
  synonyms: string[];
}

export const IMPORT_KINDS: ImportKind[] = ['staff', 'children', 'parents', 'schedule'];

export function isImportKind(v: unknown): v is ImportKind {
  return typeof v === 'string' && (IMPORT_KINDS as string[]).includes(v);
}

const PHONE_SYNONYMS = [
  'mobile',
  'mobile number',
  'mobile no',
  'mob',
  'mob no',
  'phone',
  'phone number',
  'phone no',
  'contact',
  'contact number',
  'contact no',
  'whatsapp',
  'whatsapp number',
  'whatsapp no',
  'cell',
  'cell number',
  'mobile phone',
];

const EMAIL_SYNONYMS = ['email', 'e mail', 'email id', 'email address', 'mail id', 'mail', 'e mail id'];

const CHILD_NAME_SYNONYMS = [
  'child full name',
  'child name',
  'child',
  'childs name',
  'childs full name',
  'name of child',
  'name of the child',
  'student',
  'student name',
  'name of student',
  'learner',
  'learner name',
  'ward',
  'ward name',
  'kid name',
  'beneficiary name',
];

const CHILD_DOB_SYNONYMS = ['child date of birth', 'child dob', 'childs dob', 'student dob', 'student date of birth', 'dob of child'];

export const IMPORT_COLUMNS: Record<ImportKind, ImportColumn[]> = {
  children: [
    {
      key: 'fullName',
      header: 'Full Name',
      required: true,
      type: 'name',
      synonyms: ['full name', 'name', ...CHILD_NAME_SYNONYMS, 'participant name'],
    },
    {
      key: 'preferredName',
      header: 'Preferred Name',
      required: false,
      type: 'text',
      synonyms: ['preferred name', 'nickname', 'nick name', 'called', 'short name', 'pet name', 'known as', 'call name'],
    },
    {
      key: 'dob',
      header: 'Date of Birth',
      required: true,
      type: 'date',
      synonyms: ['date of birth', 'dob', 'd o b', 'birth date', 'birthdate', 'birthday', 'born on', 'date of birth of child', ...CHILD_DOB_SYNONYMS],
    },
    {
      key: 'gender',
      header: 'Gender',
      required: false,
      type: 'gender',
      synonyms: ['gender', 'sex', 'boy girl', 'm f'],
    },
    {
      key: 'classGroup',
      header: 'Class or Group',
      required: false,
      type: 'text',
      synonyms: ['class or group', 'class', 'group', 'class group', 'section', 'batch', 'class section', 'grade', 'standard', 'std', 'programme', 'program', 'unit'],
    },
  ],
  staff: [
    {
      key: 'fullName',
      header: 'Full Name',
      required: true,
      type: 'name',
      synonyms: ['full name', 'name', 'staff name', 'therapist name', 'employee name', 'teacher name', 'name of staff', 'staff member'],
    },
    { key: 'phone', header: 'Mobile Number', required: true, type: 'phone', synonyms: PHONE_SYNONYMS },
    { key: 'email', header: 'Email', required: false, type: 'email', synonyms: EMAIL_SYNONYMS },
    {
      key: 'role',
      header: 'Role',
      required: false,
      type: 'role',
      synonyms: ['role', 'staff role', 'user role', 'access', 'access level', 'staff type', 'app role'],
    },
    {
      key: 'title',
      header: 'Job Title',
      required: false,
      type: 'text',
      synonyms: ['job title', 'title', 'designation', 'position', 'job role', 'post'],
    },
    {
      key: 'therapyTypes',
      header: 'Therapy Types',
      required: false,
      type: 'therapyTypes',
      synonyms: [
        'therapy types',
        'therapy type',
        'therapies',
        'therapy',
        'speciality',
        'specialty',
        'specialisation',
        'specialization',
        'department',
        'discipline',
        'services',
      ],
    },
  ],
  parents: [
    {
      key: 'fullName',
      header: 'Parent Full Name',
      required: true,
      type: 'name',
      synonyms: ['parent full name', 'parent name', 'name of parent', 'parent', 'guardian', 'guardian name', 'parent guardian name', 'parent or guardian', 'full name', 'name'],
    },
    { key: 'phone', header: 'Mobile Number', required: true, type: 'phone', synonyms: [...PHONE_SYNONYMS, 'parent mobile', 'parent phone', 'parent contact'] },
    { key: 'email', header: 'Email', required: false, type: 'email', synonyms: [...EMAIL_SYNONYMS, 'parent email'] },
    {
      key: 'relation',
      header: 'Relation',
      required: false,
      type: 'relation',
      synonyms: ['relation', 'relationship', 'relation to child', 'relationship with child', 'relation with child', 'guardian type'],
    },
    { key: 'childName', header: 'Child Full Name', required: true, type: 'child', synonyms: CHILD_NAME_SYNONYMS },
    { key: 'childDob', header: 'Child Date of Birth', required: false, type: 'date', synonyms: [...CHILD_DOB_SYNONYMS, 'date of birth', 'dob'] },
    {
      key: 'isPrimary',
      header: 'Primary Contact',
      required: false,
      type: 'yesno',
      synonyms: ['primary contact', 'primary', 'is primary', 'main contact', 'primary guardian', 'primary parent'],
    },
  ],
  schedule: [
    { key: 'childName', header: 'Child Full Name', required: true, type: 'child', synonyms: [...CHILD_NAME_SYNONYMS, 'name'] },
    { key: 'childDob', header: 'Child Date of Birth', required: false, type: 'date', synonyms: [...CHILD_DOB_SYNONYMS, 'date of birth', 'dob'] },
    {
      key: 'therapist',
      header: 'Therapist',
      required: true,
      type: 'therapist',
      synonyms: ['therapist', 'therapist name', 'staff', 'staff name', 'assigned therapist', 'teacher', 'educator', 'therapist mobile', 'therapist phone'],
    },
    {
      key: 'therapyType',
      header: 'Therapy Type',
      required: true,
      type: 'therapyType',
      synonyms: ['therapy type', 'therapy', 'session type', 'service', 'department', 'discipline', 'subject'],
    },
    {
      key: 'weekdays',
      header: 'Days',
      required: true,
      type: 'weekdays',
      synonyms: ['days', 'day', 'weekdays', 'week days', 'days of week', 'days of the week', 'session days', 'repeat on', 'schedule days'],
    },
    {
      key: 'startTime',
      header: 'Start Time',
      required: true,
      type: 'time',
      synonyms: ['start time', 'time', 'session time', 'from', 'slot', 'time slot', 'starts at', 'start', 'timing', 'timings'],
    },
    {
      key: 'durationMinutes',
      header: 'Duration (minutes)',
      required: false,
      type: 'duration',
      synonyms: ['duration', 'duration minutes', 'duration mins', 'minutes', 'mins', 'session length', 'length', 'session duration'],
    },
    {
      key: 'startDate',
      header: 'Start Date',
      required: false,
      type: 'date',
      synonyms: ['start date', 'from date', 'starting from', 'start from', 'begins', 'effective from', 'starting date'],
    },
    {
      key: 'endDate',
      header: 'End Date',
      required: false,
      type: 'date',
      synonyms: ['end date', 'to date', 'till', 'until', 'ends', 'end', 'valid till', 'end on', 'ending date'],
    },
    {
      key: 'room',
      header: 'Room',
      required: false,
      type: 'text',
      synonyms: ['room', 'room no', 'room number', 'location', 'venue', 'cabin', 'class room', 'classroom'],
    },
  ],
};

/**
 * Keys the validator adds to `ImportRow.values` (beyond the template keys) so adapters don't have
 * to resolve names again. All values are strings; lists are comma-separated.
 */
export const DERIVED_KEYS: Record<ImportKind, string[]> = {
  children: ['existingId'],
  staff: ['existingId', 'therapyTypeIds'],
  parents: ['existingId', 'childId'],
  schedule: ['childId', 'therapistId', 'therapyTypeId'],
};

export function columnsFor(kind: ImportKind): ImportColumn[] {
  return IMPORT_COLUMNS[kind];
}

export function requiredColumns(kind: ImportKind): ImportColumn[] {
  return IMPORT_COLUMNS[kind].filter((c) => c.required);
}
