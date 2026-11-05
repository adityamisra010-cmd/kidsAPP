/**
 * In-memory tables for Demo Mode. One array per Postgres table (see PROMPT §5), holding the same
 * domain shapes the repository returns. Denormalised display names (therapistName, assignedByName…)
 * are written at insert time, as the SQL views would.
 */
import type {
  Alert,
  Amendment,
  Announcement,
  AppNotification,
  Appointment,
  AppointmentSeries,
  AuditEntry,
  Branch,
  Child,
  ChildGuardian,
  ChildProfile,
  ChildTherapist,
  Consent,
  DataRequest,
  DemoPersonaKey,
  Goal,
  GoalBankItem,
  HomeLog,
  HomeTask,
  Invite,
  ISODateTime,
  Media,
  Membership,
  Message,
  NotificationKind,
  Organization,
  ParentCheckin,
  Profile,
  ProfileEdit,
  RatingDimension,
  RescheduleRequest,
  Resource,
  ResourceShare,
  SessionLog,
  TherapistUnavailability,
  TherapyType,
  Thread,
  UUID,
} from '@/domain/types';

export interface StoredSession extends SessionLog {
  clientId: UUID;
}

export interface StoredAmendment extends Amendment {
  sessionId: UUID;
}

export interface StoredHomeLog extends HomeLog {
  clientId: UUID;
}

export interface StoredCheckin extends ParentCheckin {
  clientId: UUID;
}

/** Messages store no read receipts; they are derived from thread_reads. */
export type StoredMessage = Omit<Message, 'readBy'>;

export interface StoredAnnouncement extends Announcement {
  /** Users who have dismissed / read it (for unread badges). */
  readBy: UUID[];
}

export interface DemoStore {
  /** Clock the dataset was generated against. */
  generatedAt: ISODateTime;
  organizations: Organization[];
  branches: Branch[];
  profiles: Profile[];
  memberships: Membership[];
  /** Therapist qualifications: which therapy types each staff member can deliver. */
  qualifications: { organizationId: UUID; userId: UUID; therapyTypeId: UUID }[];
  /** Hashed-password stand-in for staff email login. */
  credentials: { email: string; userId: UUID }[];
  personas: { key: DemoPersonaKey; userId: UUID }[];
  invites: Invite[];
  therapyTypes: TherapyType[];
  dimensions: RatingDimension[];
  children: Child[];
  childProfiles: ChildProfile[];
  profileEdits: ProfileEdit[];
  guardians: ChildGuardian[];
  childTherapists: ChildTherapist[];
  goalBank: GoalBankItem[];
  goals: Goal[];
  series: AppointmentSeries[];
  appointments: Appointment[];
  briefAcks: { appointmentId: UUID; userId: UUID; at: ISODateTime }[];
  rescheduleRequests: RescheduleRequest[];
  unavailability: TherapistUnavailability[];
  sessions: StoredSession[];
  amendments: StoredAmendment[];
  checkins: StoredCheckin[];
  homeTasks: HomeTask[];
  homeLogs: StoredHomeLog[];
  media: Media[];
  resources: Resource[];
  resourceShares: ResourceShare[];
  threads: Thread[];
  threadMembers: { threadId: UUID; userId: UUID }[];
  messages: StoredMessage[];
  threadReads: { threadId: UUID; userId: UUID; lastReadAt: ISODateTime }[];
  announcements: StoredAnnouncement[];
  alerts: Alert[];
  notifications: AppNotification[];
  mutedKinds: { userId: UUID; kinds: NotificationKind[] }[];
  pushTokens: { userId: UUID; token: string; platform: 'android' | 'ios' | 'web' }[];
  consents: Consent[];
  dataRequests: DataRequest[];
  audit: AuditEntry[];
}

export function emptyStore(generatedAt: ISODateTime): DemoStore {
  return {
    generatedAt,
    organizations: [],
    branches: [],
    profiles: [],
    memberships: [],
    qualifications: [],
    credentials: [],
    personas: [],
    invites: [],
    therapyTypes: [],
    dimensions: [],
    children: [],
    childProfiles: [],
    profileEdits: [],
    guardians: [],
    childTherapists: [],
    goalBank: [],
    goals: [],
    series: [],
    appointments: [],
    briefAcks: [],
    rescheduleRequests: [],
    unavailability: [],
    sessions: [],
    amendments: [],
    checkins: [],
    homeTasks: [],
    homeLogs: [],
    media: [],
    resources: [],
    resourceShares: [],
    threads: [],
    threadMembers: [],
    messages: [],
    threadReads: [],
    announcements: [],
    alerts: [],
    notifications: [],
    mutedKinds: [],
    pushTokens: [],
    consents: [],
    dataRequests: [],
    audit: [],
  };
}
