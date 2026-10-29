/**
 * Template CSVs, embedded so "Download template" works offline. Must stay identical to the files
 * in CSV_TEMPLATES/ (a test checks this) and use the headers from ./columns.ts.
 */
import type { ImportKind } from '@/domain/types';

export const TEMPLATES: Record<ImportKind, string> = {
  staff: `Full Name,Mobile Number,Email,Role,Job Title,Therapy Types
Dr. Kavita Menon,+91 98450 12345,kavita.menon@example.com,Coordinator,Clinical Lead,Speech Therapy
Ms. Priya Nair,98201 45678,priya.nair@example.com,Therapist,Speech Therapist,Speech Therapy
Rahul Verma,09811223344,,Therapist,Occupational Therapist,Occupational Therapy; Physiotherapy
`,
  children: `Full Name,Preferred Name,Date of Birth,Gender,Class or Group
Aarav Sharma,Aaru,14/03/2019,Male,Sunflower (Early Intervention)
Diya Iyer,,02/11/2017,Female,Lotus (Primary)
Mohammed Faizan Khan,Faizan,23/07/2018,Male,Lotus (Primary)
`,
  parents: `Parent Full Name,Mobile Number,Email,Relation,Child Full Name,Child Date of Birth,Primary Contact
Neha Sharma,+91 99100 23456,neha.sharma@example.com,Mother,Aarav Sharma,14/03/2019,Yes
Vikram Sharma,99100 65432,,Father,Aarav Sharma,14/03/2019,No
Lakshmi Iyer,08861234567,lakshmi.iyer@example.com,Mother,Diya Iyer,02/11/2017,Yes
`,
  schedule: `Child Full Name,Child Date of Birth,Therapist,Therapy Type,Days,Start Time,Duration (minutes),Start Date,End Date,Room
Aarav Sharma,14/03/2019,Ms. Priya Nair,Speech Therapy,Mon/Wed/Fri,10:30 AM,45,03/11/2026,31/03/2027,Room 2
Diya Iyer,02/11/2017,Rahul Verma,Occupational Therapy,Tue/Thu,11:15 AM,45,03/11/2026,31/03/2027,OT Room
Mohammed Faizan Khan,23/07/2018,Ms. Priya Nair,Speech Therapy,Tue/Sat,9:30 AM,30,03/11/2026,,Room 2
`,
};

export function templateFileName(kind: ImportKind): string {
  return `${kind}-template.csv`;
}
