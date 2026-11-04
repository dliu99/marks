import { memo } from 'react';
import { Text, View } from 'react-native';
import type { CourseStandard } from '@/api/src/types';

function formatStandardScore(standard: CourseStandard) {
  if (standard.score) return standard.score;
  if (standard.percent != null) return `${Math.round(standard.percent * 100) / 100}%`;
  return '—';
}

function StandardsListComponent({ standards }: { standards?: CourseStandard[] }) {
  if (!standards?.length) return null;

  return (
    <View className="mt-6">
      <Text className="mb-4 text-2xl font-bold text-stone-100">Standards</Text>
      <View className="rounded-2xl border border-stone-700 px-5">
        {standards.map((standard, index) => (
          <View
            key={standard.taskID}
            className={`flex-row items-center justify-between py-4 ${
              index > 0 ? 'border-t border-stone-800' : ''
            }`}>
            <Text className="mr-4 flex-1 text-base text-stone-200" numberOfLines={3}>
              {standard.taskName}
            </Text>
            <Text
              className={`text-xl font-bold ${
                standard.score || standard.percent != null ? 'text-stone-50' : 'text-stone-500'
              }`}>
              {formatStandardScore(standard)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export const StandardsList = memo(StandardsListComponent);
