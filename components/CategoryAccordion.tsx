import { Alert, View, Text, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { memo, useState, useCallback, useMemo } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MenuView } from '@react-native-menu/menu';
import { GradeCard } from './GradeCard';
import {
  calculateCategoryPercent,
  calculatePercentImpact,
  getHiddenAssignmentMaxPoints,
  type ModifiedAssignment,
  type ModifiedCategory,
  type RecalculateGradeOptions,
} from '@/utils/grade-calculator';
import { playHaptic } from '@/utils/haptics';

type CategoryAccordionProps = {
  category: ModifiedCategory;
  allCategories: ModifiedCategory[];
  isWeighted: boolean;
  courseDisplayPercent: number | null;
  gradeBaseline?: RecalculateGradeOptions;
  showPercentImpact?: boolean;
  defaultExpanded?: boolean;
  onEditGrade: (assignment: ModifiedAssignment) => void;
  onAddAssignment: (category: ModifiedCategory) => void;
  onResetCategory: (category: ModifiedCategory) => void;
  onDeleteCategory: (groupID: number) => void;
};

function CategoryAccordionComponent({
  category,
  allCategories,
  isWeighted,
  courseDisplayPercent,
  gradeBaseline,
  showPercentImpact = true,
  defaultExpanded = false,
  onEditGrade,
  onAddAssignment,
  onResetCategory,
  onDeleteCategory,
}: CategoryAccordionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotation = useSharedValue(defaultExpanded ? 180 : 0);
  const contentProgress = useSharedValue(defaultExpanded ? 1 : 0);

  const { calculatedPercent, hasModifications } = useMemo(() => {
    const hasMods = category.assignments.some((a) => a.isModified);

    return {
      calculatedPercent: calculateCategoryPercent(category),
      hasModifications: hasMods,
    };
  }, [category]);

  const toggleExpanded = useCallback(() => {
    const newExpanded = !expanded;
    playHaptic('category');
    setExpanded(newExpanded);
    rotation.value = withTiming(newExpanded ? 180 : 0, {
      duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    contentProgress.value = withTiming(newExpanded ? 1 : 0, {
      duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [contentProgress, expanded, rotation]);

  const animatedChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      opacity: contentProgress.value,
      transform: [
        {
          translateY: (1 - contentProgress.value) * -8,
        },
      ],
    };
  });

  const getProgressColor = () => {
    if (calculatedPercent === null) return 'text-stone-400';
    if (hasModifications || category.isVirtual) return 'text-amber-400';
    return 'text-stone-100';
  };

  const getBorderColor = () => {
    if (category.isVirtual) return 'border-amber-500/50';
    return 'border-stone-700';
  };

  const formatPercent = (value: number) => {
    return value.toFixed(2).replace(/\.?0+$/, '');
  };

  const sortedAssignments = useMemo(() => {
    const assignmentsWithImpact = category.assignments.map((assignment) => {
      const percentImpact = calculatePercentImpact(
        assignment,
        allCategories,
        isWeighted,
        courseDisplayPercent,
        gradeBaseline
      );
      return {
        ...assignment,
        percentImpact: Math.round(percentImpact * -100) / 100,
      };
    });

    return assignmentsWithImpact.sort((a, b) => {
      const dateA = a.scoreModifiedDate || a.dueDate;
      const dateB = b.scoreModifiedDate || b.dueDate;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [allCategories, category.assignments, courseDisplayPercent, gradeBaseline, isWeighted]);

  const displayPercent = calculatedPercent;
  // Letter-graded categories report a mark but no percentage.
  const categoryScore = hasModifications ? null : (category.progress?.progressScore ?? null);
  const hiddenMaxPoints = getHiddenAssignmentMaxPoints(category);
  const menuActions = [
    { id: 'add', title: 'Add Assignment', image: 'plus.circle', imageColor: 'white' },
    ...(category.assignments.length > 0
      ? [
          {
            id: 'reset',
            title: 'Reset Category',
            image: 'arrow.counterclockwise',
            imageColor: 'red',
            attributes: { destructive: true as const },
          },
        ]
      : []),
    ...(category.isVirtual
      ? [
          {
            id: 'delete-category',
            title: 'Delete Category',
            image: 'trash',
            imageColor: 'red',
            attributes: { destructive: true as const },
          },
        ]
      : []),
  ];

  return (
    <View className={`border ${getBorderColor()} mb-4 overflow-hidden rounded-2xl`}>
      <View className="flex-row items-center p-5">
        <Pressable onPress={toggleExpanded} className="flex-1 flex-row items-center">
          <Animated.View style={animatedChevronStyle} className="mr-3">
            <Ionicons name="chevron-down" size={24} color="#a8a29e" />
          </Animated.View>
          <View className="mr-4 flex-1">
            <Text className="text-xl font-semibold text-stone-100" numberOfLines={2}>
              {category.name}
            </Text>
            <View className="mt-2 flex-row items-center gap-3">
              {category.isVirtual && (
                <View className="rounded-lg bg-amber-500/15 px-2.5 py-1">
                  <Text className="text-sm font-medium text-amber-400">Added</Text>
                </View>
              )}
              {category.weight > 0 && (
                <View className="rounded-lg bg-stone-800 px-2.5 py-1">
                  <Text className="text-sm font-medium text-stone-300">{category.weight}%</Text>
                </View>
              )}
              <Text className="text-base text-stone-500">
                {category.assignments.length + (hiddenMaxPoints !== null ? 1 : 0)} assignment
                {category.assignments.length + (hiddenMaxPoints !== null ? 1 : 0) !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          {displayPercent !== null ? (
            <Text className={`text-2xl font-bold ${getProgressColor()}`}>
              {formatPercent(displayPercent)}%
            </Text>
          ) : categoryScore ? (
            <Text className="text-2xl font-bold text-stone-100">{categoryScore}</Text>
          ) : null}
        </Pressable>
        <MenuView
          onPressAction={({ nativeEvent }) => {
            playHaptic(
              nativeEvent.event === 'reset' || nativeEvent.event === 'delete-category'
                ? 'warning'
                : 'category'
            );
            switch (nativeEvent.event) {
              case 'add':
                onAddAssignment(category);
                break;
              case 'reset':
                onResetCategory(category);
                break;
              case 'delete-category':
                onDeleteCategory(category.groupID);
                break;
            }
          }}
          actions={menuActions}>
          <TouchableOpacity className="py-2 pl-3">
            <Ionicons name="ellipsis-horizontal" size={20} color="#a8a29e" />
          </TouchableOpacity>
        </MenuView>
      </View>

      {expanded ? (
        <Animated.View style={animatedContentStyle}>
          <View className="px-3 pb-3">
            {sortedAssignments.map((assignment) => (
              <GradeCard
                key={assignment.objectSectionID}
                assignment={assignment}
                percentImpact={showPercentImpact ? assignment.percentImpact : undefined}
                isModified={assignment.isModified}
                isVirtual={assignment.objectSectionID < 0}
                isCategory
                onEditGradePress={() => onEditGrade(assignment)}
              />
            ))}
            {hiddenMaxPoints !== null && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hidden assignment details"
                className="flex-row items-center justify-between px-2 py-3"
                onPress={() => {
                  playHaptic('navigation');
                  Alert.alert(
                    'Hidden assignment',
                    "Infinite Campus returned a total category point value that doesn't line up with the assignments we can find. We assume this means that your course has a hidden assignment."
                  );
                }}>
                <View className="mr-4 flex-1">
                  <Text className="text-xl font-semibold text-stone-50">Hidden assignment</Text>
                  <Text className="mt-2 text-base text-stone-500">
                    {formatPercent(hiddenMaxPoints)} pts
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="mr-1 flex-row items-center rounded-lg bg-stone-800 px-3 py-2">
                    <Text className="text-xl font-bold text-stone-500">—</Text>
                    <Text className="mx-1 text-xl font-bold text-stone-500">/</Text>
                    <Text className="text-xl font-bold text-stone-100">
                      {formatPercent(hiddenMaxPoints)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#78716c" />
                </View>
              </Pressable>
            )}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

export const CategoryAccordion = memo(CategoryAccordionComponent);
