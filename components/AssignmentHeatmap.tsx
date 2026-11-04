import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { Assignment } from '@/api/src/types';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { playHaptic } from '@/utils/haptics';

type AssignmentHeatmapProps = {
  assignments: Assignment[];
  courseNameMap: Map<number, string>;
  currentDate: dayjs.Dayjs;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getIntensityClass(count: number): string {
  if (count === 0) return 'bg-stone-800';
  if (count === 1) return 'bg-emerald-900';
  if (count === 2) return 'bg-emerald-700';
  if (count === 3) return 'bg-emerald-500';
  return 'bg-emerald-400';
}

export function AssignmentHeatmap({
  assignments,
  courseNameMap,
  currentDate,
}: AssignmentHeatmapProps) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [gridWidth, setGridWidth] = useState<number | null>(null);

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      const dateKey = dayjs(assignment.dueDate).startOf('day').format('YYYY-MM-DD');
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(assignment);
    }
    return map;
  }, [assignments]);

  const calendarDays = useMemo(() => {
    const startOfMonth = currentDate.startOf('month');
    const endOfMonth = currentDate.endOf('month');
    const startDayOfWeek = startOfMonth.day();
    const daysInMonth = endOfMonth.date();

    const days: { date: dayjs.Dayjs | null; dateKey: string | null }[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, dateKey: null });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = startOfMonth.date(day);
      days.push({ date, dateKey: date.format('YYYY-MM-DD') });
    }

    const remainingCells = 7 - (days.length % 7);
    if (remainingCells < 7) {
      for (let i = 0; i < remainingCells; i++) {
        days.push({ date: null, dateKey: null });
      }
    }

    return days;
  }, [currentDate]);

  const gap = 4;
  const availableWidth = gridWidth ?? width - 64;
  // Floor to whole pixels so Yoga rounding does not push the 7th cell onto a new row.
  const cellSize = Math.max(0, Math.floor((availableWidth - gap * 6) / 7));

  return (
    <View className="mb-8">
      <View className="rounded-2xl border border-stone-700 p-4">
        <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
          <View className="mb-2 flex-row" style={{ gap }}>
            {WEEKDAYS.map((day, index) => (
              <View key={index} style={{ width: cellSize }} className="items-center">
                <Text className="text-xs font-medium text-stone-500">{day}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap" style={{ gap }}>
            {calendarDays.map((day, index) => {
              const count = day.dateKey ? (assignmentsByDate.get(day.dateKey)?.length ?? 0) : 0;
              const isToday = day.dateKey === currentDate.format('YYYY-MM-DD');
              const hasAssignments = count > 0;

              return (
                <Pressable
                  key={index}
                  onPress={() => {
                    if (!hasAssignments || !day.dateKey) return;
                    playHaptic('navigation');
                    router.push(`/(protected)/day-modal?date=${day.dateKey}`);
                  }}
                  style={{ width: cellSize, height: cellSize }}
                  className={`items-center justify-center rounded-lg active:scale-[0.97] active:opacity-80 ${day.date ? getIntensityClass(count) : 'bg-transparent'} ${isToday ? 'border-2 border-stone-500' : ''}`}></Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}
