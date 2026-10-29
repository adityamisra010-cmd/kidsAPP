/** Present / Late (+ minutes) / Absent / Cancelled by school / Cancelled by parent. */
import { CalendarX, CircleCheck, Clock, UserX, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useRepo } from '@/data';
import type { AppointmentView, Attendance } from '@/domain/types';
import { formatTimeRange } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { Button, errorMessageKey, Sheet, Stack, Stepper, Text, toast } from '@/ui';

import { useScheduleMutation } from '../queries';

const OPTIONS: { value: Attendance; icon: LucideIcon }[] = [
  { value: 'present', icon: CircleCheck },
  { value: 'late', icon: Clock },
  { value: 'absent', icon: UserX },
  { value: 'cancelled_by_school', icon: CalendarX },
  { value: 'cancelled_by_parent', icon: CalendarX },
];

function AttendanceSheetBody({ appointment: a, visible, onClose }: { appointment: AppointmentView; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const repo = useRepo();
  const [value, setValue] = useState<Attendance | undefined>(a.attendance);
  const [late, setLate] = useState(a.lateMinutes ?? 10);
  const save = useScheduleMutation((v: { attendance: Attendance; lateMinutes?: number }) => repo.appointments.markAttendance(a.id, v.attendance, v.lateMinutes));


  const onSave = async () => {
    if (!value) return;
    try {
      await save.mutateAsync({ attendance: value, lateMinutes: value === 'late' ? late : undefined });
      toast.success(tr('attendance.saved'));
      onClose();
    } catch (e) {
      toast.error(tr(errorMessageKey(e)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('attendance.title')}
      subtitle={tr('attendance.subtitle', { child: a.childName, time: formatTimeRange(a.startsAt, a.endsAt) })}
      testID="attendance-sheet"
      footer={<Button label={tr('attendance.save')} onPress={() => void onSave()} disabled={!value} loading={save.isPending} fullWidth />}
    >
      <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
        {OPTIONS.map(({ value: v, icon: Icon }) => {
          const selected = v === value;
          return (
            <Pressable
              key={v}
              onPress={() => setValue(v)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${tr(`attendance.options.${v}`)}, ${tr(`attendance.hints.${v}`)}`}
              testID={`attendance-${v}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[3],
                minHeight: TOUCH + 8,
                paddingHorizontal: t.space[3],
                borderRadius: t.radius.md,
                borderWidth: 1.5,
                borderColor: selected ? t.colors.primary : t.colors.border,
                backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
              }}
            >
              <Icon size={22} color={selected ? t.colors.primaryText : t.colors.textMuted} />
              <Stack gap={0} flex={1}>
                <Text variant="bodyStrong" tint={selected ? t.colors.primaryText : t.colors.text}>
                  {tr(`attendance.options.${v}`)}
                </Text>
                <Text variant="caption" color="textMuted">
                  {tr(`attendance.hints.${v}`)}
                </Text>
              </Stack>
            </Pressable>
          );
        })}
      </View>
      {value === 'late' ? <Stepper label={tr('attendance.lateMinutes')} value={late} onChange={setLate} min={5} max={90} step={5} suffix={tr('attendance.minSuffix')} testID="late-minutes" /> : null}
    </Sheet>
  );
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function AttendanceSheet(props: Parameters<typeof AttendanceSheetBody>[0]) {
  return props.visible ? <AttendanceSheetBody {...props} /> : null;
}
