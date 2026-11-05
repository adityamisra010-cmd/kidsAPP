/** Parent pre-session check-ins (idempotent on clientId). */
import type { AppointmentView } from '@/domain/types';

import { RepoError, type CheckinsRepo } from '../repository';
import type { AdapterContext } from './context';
import { istDayBounds, todayIST } from './derive-local';
import { checkinFromRow } from './mappers';
import { done, many, maybe, single } from './query';
import type { AppointmentJoinedRow, ParentCheckinRow } from './rows';
import { APPOINTMENT_SELECT, hydrateAppointments } from './views';

export function createCheckinsRepo(c: AdapterContext): CheckinsRepo {
  const sb = c.sb;
  return {
    async submit(input) {
      if (!input.clientId) throw new RepoError('validation', 'clientId is required');
      // ON CONFLICT (client_id) DO NOTHING, then read back: retries never duplicate.
      await done(
        sb.from('parent_checkins').upsert(
          {
            client_id: input.clientId,
            child_id: input.childId,
            appointment_id: input.appointmentId ?? null,
            date: input.date || todayIST(c.now()),
            sleep: input.sleep,
            ate_breakfast: input.ateBreakfast,
            mood: input.mood,
            change_flag: input.changeFlag,
            change_note: input.changeFlag ? input.changeNote.trim() : '',
            submitted_by: c.requireUserId(),
          },
          { onConflict: 'client_id', ignoreDuplicates: true },
        ),
      );
      return checkinFromRow(await single<ParentCheckinRow>(sb.from('parent_checkins').select('*').eq('client_id', input.clientId), 'check-in'));
    },

    async forAppointment(appointmentId) {
      const row = await maybe<ParentCheckinRow>(
        sb.from('parent_checkins').select('*').eq('appointment_id', appointmentId).order('created_at', { ascending: false }).limit(1),
      );
      return row ? checkinFromRow(row) : null;
    },

    async pendingForToday(): Promise<AppointmentView[]> {
      if (!c.isParent()) return [];
      const childIds = await c.guardianChildIds();
      if (childIds.length === 0) return [];
      const today = todayIST(c.now());
      const day = istDayBounds(today);
      const [appts, checkins] = await Promise.all([
        many<AppointmentJoinedRow>(
          sb
            .from('appointments')
            .select(APPOINTMENT_SELECT)
            .in('child_id', childIds)
            .eq('status', 'scheduled')
            .gte('starts_at', day.start)
            .lt('starts_at', day.end)
            .gt('ends_at', c.now().toISOString())
            .order('starts_at'),
        ),
        many<Pick<ParentCheckinRow, 'child_id' | 'appointment_id'>>(
          sb.from('parent_checkins').select('child_id,appointment_id').in('child_id', childIds).eq('date', today),
        ),
      ]);
      const doneAppts = new Set(checkins.map((x) => x.appointment_id).filter(Boolean));
      // A check-in without an appointment covers that child's sessions for the day.
      const doneChildren = new Set(checkins.filter((x) => !x.appointment_id).map((x) => x.child_id));
      return hydrateAppointments(
        c,
        appts.filter((a) => !doneAppts.has(a.id) && !doneChildren.has(a.child_id)),
      );
    },
  };
}
