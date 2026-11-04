import { ExtractedCourse } from '@/api/src/types';

export function sortCoursesByPreference(courses: ExtractedCourse[], courseOrder: number[]) {
  if (courses.length <= 1) {
    return courses;
  }

  const orderIndex = new Map(courseOrder.map((sectionID, index) => [sectionID, index]));

  return [...courses]
    .map((course, index) => ({
      course,
      index,
      preferredIndex: orderIndex.get(course.sectionID) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((left, right) => {
      if (left.preferredIndex !== right.preferredIndex) {
        return left.preferredIndex - right.preferredIndex;
      }

      return left.index - right.index;
    })
    .map(({ course }) => course);
}
