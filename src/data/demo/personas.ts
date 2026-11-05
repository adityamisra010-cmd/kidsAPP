/** Demo personas for the login screen's "Try demo" role picker. Strings are English source text. */
import type { DemoPersonaKey } from '@/domain/types';

export interface DemoPersona {
  key: DemoPersonaKey;
  name: string;
  roleLabel: string;
  school: string;
  /** One line on what to try with this persona. */
  description: string;
  phone: string;
  email?: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    key: 'parent',
    name: 'Priya Sharma',
    roleLabel: 'Parent',
    school: 'Anvaya CDC, Noida',
    description: "See Aarav's next session and latest snapshot, log a home task with a video, and message the care team.",
    phone: '+919800000001',
  },
  {
    key: 'therapist',
    name: 'Riya Menon',
    roleLabel: 'Therapist',
    school: 'Anvaya CDC, Noida',
    description: "Open today's agenda, read the Handover Brief for a substitute session, log a session, and review parent videos.",
    phone: '+919800000002',
    email: 'riya@anvaya.demo',
  },
  {
    key: 'coordinator',
    name: 'Dr. Meera Iyer',
    roleLabel: 'Coordinator',
    school: 'Anvaya CDC, Noida',
    description: 'Assign substitutes for a therapist on leave, answer reschedule requests, and follow up on children needing attention.',
    phone: '+919800000003',
    email: 'meera@anvaya.demo',
  },
  {
    key: 'school_admin',
    name: 'Sunita Bansal',
    roleLabel: 'School Admin',
    school: 'Anvaya CDC, Noida',
    description: 'Import children from a spreadsheet, create a recurring schedule, and export a child progress report.',
    phone: '+919800000004',
    email: 'sunita@anvaya.demo',
  },
  {
    key: 'platform_admin',
    name: 'Kabir Anand',
    roleLabel: 'Platform Admin',
    school: 'All schools',
    description: 'Compare partner schools at a glance and set up a new school with its first admin invite.',
    phone: '+919800000005',
    email: 'kabir@mykidstracker.demo',
  },
];
