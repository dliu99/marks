import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { CourseTermOption, CourseTermTaskOption } from '@/api/src/types';
import { QueryErrorState } from '@/components/QueryErrorState';
import { useCourseTerms } from '@/hooks/use-ic';
import { usePreferences } from '@/hooks/use-preferences';
import { playHaptic } from '@/utils/haptics';
import { useBottomContentPadding, useTransparentHeaderScrollPadding } from '@/utils/screen-spacing';
import {
  setKeepPreferredTermAfterEnd,
  setPreferredTaskID,
  setPreferredTermID,
} from '@/utils/storage';
import { isPinnedTermSuperseded } from '@/api/src/course-grades';

function TermRow({
  label,
  status,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  status?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        playHaptic('selection');
        onPress();
      }}
      className={`mb-4 rounded-2xl border border-stone-700 p-5 active:scale-[0.98] active:opacity-80 ${disabled ? 'opacity-60' : ''}`}>
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="text-xl font-semibold text-white">{label}</Text>
          {status ? <Text className="mt-1 text-base text-stone-400">{status}</Text> : null}
        </View>
        <View className="h-7 w-7 items-center justify-center">
          {selected ? <Ionicons name="checkmark-circle" size={24} color="#22c55e" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function getTermLabel(term: CourseTermOption) {
  const termName = term.termName || `Term ${term.termSeq}`;
  return term.academicYear ? `${termName} · ${term.academicYear}` : termName;
}

function formatTaskGrade(task: CourseTermTaskOption) {
  if (task.score && task.percent !== null) return `${task.score} (${task.percent}%)`;
  if (task.score) return task.score;
  if (task.percent !== null) return `${task.percent}%`;
  return null;
}

function getTaskStatus(task: CourseTermTaskOption) {
  const hasAssignmentDetail = task.hasAssignments && task.hasDetail;
  const detailStatus = hasAssignmentDetail
    ? 'Assignments available'
    : task.hasGrades
      ? 'Course grades available - no assignments'
      : 'No assignments';
  const grade = formatTaskGrade(task);
  return grade ? `${detailStatus} - ${grade}` : detailStatus;
}

export default function SelectTerm() {
  const queryClient = useQueryClient();
  const { preferredTermID, preferredTaskID } = usePreferences();
  const { data: terms = [], isLoading, error, refetch, isFetching } = useCourseTerms();
  const contentTopPadding = useTransparentHeaderScrollPadding(24);
  const contentBottomPadding = useBottomContentPadding(32, { includesNativeTabBar: true });

  const selectTask = (termID: number | null, taskID: number | null) => {
    // Picking a term that is already over is deliberate, so it stays selected. A term
    // picked while in session returns to Automatic once a newer term starts.
    setKeepPreferredTermAfterEnd(termID !== null && isPinnedTermSuperseded(terms, termID));
    setPreferredTermID(termID);
    setPreferredTaskID(taskID);
    void queryClient.invalidateQueries({ queryKey: ['ic'] });
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-900">
        <Text className="text-stone-400">Loading terms...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-neutral-900" collapsable={false}>
        <QueryErrorState
          error={error}
          subject="terms"
          onRetry={async () => {
            await refetch();
          }}
          retrying={isFetching}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-900">
      <ScrollView
        className="flex-1 px-5"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: contentTopPadding,
          paddingBottom: contentBottomPadding,
        }}
        showsVerticalScrollIndicator={false}>
        <TermRow
          label="Automatic"
          selected={preferredTermID === null && preferredTaskID === null}
          onPress={() => selectTask(null, null)}
        />
        {terms.map((term) => (
          <View key={term.termID} className="mb-2">
            <Text className="mb-3 px-1 text-base font-semibold text-stone-500">
              {getTermLabel(term)}
            </Text>
            {term.tasks.map((task) => {
              const selectable = task.hasGrades;
              return (
                <TermRow
                  key={task.taskID}
                  label={task.taskName}
                  status={getTaskStatus(task)}
                  selected={preferredTermID === term.termID && preferredTaskID === task.taskID}
                  disabled={!selectable}
                  onPress={() => selectTask(term.termID, task.taskID)}
                />
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
