import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import type { Assignment } from '@/api/src/types';
import { AssignmentCard } from './AssignmentCard';

export function AssignmentSubjects({ assignments }: { assignments: Assignment[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const subjects = useMemo(() => {
    const grouped = new Map<number, Assignment[]>();
    for (const assignment of assignments) {
      grouped.set(assignment.sectionID, [...(grouped.get(assignment.sectionID) ?? []), assignment]);
    }
    return [...grouped.entries()];
  }, [assignments]);
  return (
    <View>
      <Text className="mb-4 text-stone-400">Subjects with available assignments</Text>
      {subjects.map(([sectionID, rows]) => (
        <View key={sectionID} className="mb-4">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: expanded === sectionID }}
            onPress={() => setExpanded(expanded === sectionID ? null : sectionID)}
            className="flex-row items-center justify-between rounded-2xl border border-stone-700 p-5">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-semibold text-stone-100">{rows[0].courseName}</Text>
              <Text className="mt-1 text-stone-400">
                Overall grade unavailable · {rows.length}{' '}
                {rows.length === 1 ? 'assignment' : 'assignments'}
              </Text>
            </View>
            <Ionicons
              name={expanded === sectionID ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#a8a29e"
            />
          </Pressable>
          {expanded === sectionID && (
            <View className="mt-3">
              {[...rows]
                .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
                .map((assignment) => (
                  <AssignmentCard
                    key={assignment.objectSectionID}
                    assignment={assignment}
                    now={dayjs()}
                  />
                ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
