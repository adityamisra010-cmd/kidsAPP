/**
 * Pure derivations shared by the Demo and Supabase adapters: display status, Handover Brief chips,
 * parent snapshots, goal stats, attendance, home-practice completion, series expansion, conflict
 * detection and parent progress. No adapter state, no I/O; callers pass in the rows they loaded.
 * Split by topic under ./derive/; import everything from '@/domain/derive'.
 */
export * from './derive/appointments';
export * from './derive/goals';
export * from './derive/practice';
export * from './derive/progress';
export * from './derive/schedule';
export * from './derive/sessions';
