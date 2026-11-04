import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createLocalAPI } from '@/api/src/shared/local-api';
import { campusFetch } from '@/utils/campus-network';
import { campusSessions } from '@/utils/campus-session';
import { hc } from 'hono/client';
import {
  App,
  Assignment,
  AssignmentDetail,
  CourseGradeDetailResponse,
  CourseTermOption,
  ExtractedCourse,
  GradeOverview,
  ResponsiveScheduleSession,
  userAccount,
  UserProfile,
} from '@/api/src/types';
import { usePreferences } from '@/hooks/use-preferences';

const localAPI = createLocalAPI(campusSessions, campusFetch);

const localFetch: typeof fetch = async (input, init) => localAPI.request(input, init);
function getClient() {
  return hc<typeof localAPI>('https://marks.local', { fetch: localFetch });
}

function getPreferredGradeQuery(preferredTermID: number | null, preferredTaskID: number | null) {
  return {
    ...(preferredTermID ? { termID: preferredTermID.toString() } : {}),
    ...(preferredTaskID ? { taskID: preferredTaskID.toString() } : {}),
  };
}

function getCourseGradeDetailResponse(
  sectionID: number,
  preferredTermID: number | null,
  preferredTaskID: number | null
) {
  const query = new URLSearchParams(
    getPreferredGradeQuery(preferredTermID, preferredTaskID)
  ).toString();
  const suffix = query ? `?${query}` : '';

  return localFetch(`https://marks.local/ic/courseGrades/${sectionID}${suffix}`);
}

type ApiError = Error & { status: number };

async function createApiError(res: Response): Promise<ApiError> {
  let message = res.statusText || 'Request failed';

  try {
    const errorData = (await res.json()) as { message?: string };
    if (errorData.message) {
      message = errorData.message;
    }
  } catch {
    // Keep the default message when the response body is empty or not JSON.
  }

  const error = new Error(message) as ApiError;
  error.status = res.status;
  return error;
}

function createNetworkError(): ApiError {
  const error = new Error('Network request failed') as ApiError;
  error.status = 0;
  return error;
}

const GRADE_STALE_TIME = 1000 * 60 * 5;

export function useUser() {
  return useQuery({
    queryKey: ['ic', 'user'],
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.user.$get();
        if (res.ok) {
          return (await res.json()) as unknown as userAccount;
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}

export function useGrades() {
  const { preferredTermID, preferredTaskID } = usePreferences();

  return useQuery({
    queryKey: ['ic', 'grades', preferredTermID, preferredTaskID],
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.courseGrades.$get({
          query: getPreferredGradeQuery(preferredTermID, preferredTaskID),
        });
        if (res.ok) {
          return (await res.json()) as ExtractedCourse[];
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}

export function useAllAssignments() {
  return useQuery({
    queryKey: ['ic', 'allAssignments'],
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.assignments.$get();
        if (res.ok) {
          return (await res.json()) as Assignment[];
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}

export function useAssignment(objectSectionID: number) {
  return useQuery({
    queryKey: ['ic', 'assignment', objectSectionID],
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.assignments[':objectSectionID'].$get({
          param: { objectSectionID: objectSectionID.toString() },
        });
        if (res.ok) {
          return (await res.json()) as AssignmentDetail;
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
    enabled: !!objectSectionID,
  });
}

export function useProfile() {
  const { data: grades } = useGrades();
  const enrollmentID = grades?.[0]?.enrollmentID;

  return useQuery({
    queryKey: ['ic', 'profile', enrollmentID],
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.user.profile.$get();
        if (!res.ok) throw await createApiError(res);

        const profile = (await res.json()) as UserProfile;

        if (enrollmentID) {
          const attendanceRes = await client.ic.attendance[':enrollmentID'].$get({
            param: { enrollmentID: enrollmentID.toString() },
          });
          if (attendanceRes.ok) {
            const attendance = (await attendanceRes.json()) as {
              absences: number;
              tardies: number;
            };
            return { ...profile, ...attendance };
          }
        }
        return { ...profile, absences: null, tardies: null };
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}

export function useAppList(enabled = true) {
  return useQuery({
    queryKey: ['ic', 'appList'],
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.user.appList.$get();
        if (res.ok) {
          return (await res.json()) as App[];
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
    enabled,
  });
}

export function useResponsiveSchedule(
  sectionID?: number,
  calendarID?: number,
  structureID?: number
) {
  return useQuery({
    queryKey: ['ic', 'responsiveSchedule', sectionID],
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.responsiveSchedule.$get({
          query: {
            sectionID: sectionID?.toString() ?? '',
            calendarID: calendarID?.toString() ?? '',
            structureID: structureID?.toString() ?? '',
          },
        });
        if (res.ok) {
          return (await res.json()) as ResponsiveScheduleSession[];
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
    enabled: !!sectionID && !!calendarID && !!structureID,
  });
}

export function useAllGrades() {
  const { preferredTermID, preferredTaskID } = usePreferences();

  return useQuery({
    queryKey: ['ic', 'courseGrades', preferredTermID, preferredTaskID],
    staleTime: GRADE_STALE_TIME,
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.courseGrades.$get({
          query: getPreferredGradeQuery(preferredTermID, preferredTaskID),
        });
        if (res.ok) {
          return (await res.json()) as ExtractedCourse[];
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}

export function useAllGradesWithDetails() {
  const queryClient = useQueryClient();
  const { preferredTermID, preferredTaskID } = usePreferences();

  return useQuery({
    queryKey: ['ic', 'allGradesWithDetails', preferredTermID, preferredTaskID],
    staleTime: GRADE_STALE_TIME,
    queryFn: async () => {
      const generation = campusSessions.generation();
      const assertCurrentAccount = () => {
        if (campusSessions.generation() !== generation)
          throw new Error('Your account changed. Please refresh.');
      };
      try {
        const client = getClient();
        const coursesRes = await client.ic.courseGrades.overview.$get({
          query: getPreferredGradeQuery(preferredTermID, preferredTaskID),
        });
        if (!coursesRes.ok) throw await createApiError(coursesRes);

        const { courses, availability, assignmentFallbackAllowed } =
          (await coursesRes.json()) as GradeOverview;
        let fallbackAssignments: Assignment[] = [];
        let fallbackAssignmentsError = false;
        if (!courses.length && assignmentFallbackAllowed && !preferredTermID) {
          try {
            const assignmentRes = await client.ic.assignments.$get();
            if (!assignmentRes.ok) throw await createApiError(assignmentRes);
            fallbackAssignments = (await assignmentRes.json()) as Assignment[];
          } catch {
            fallbackAssignmentsError = true;
          }
        }
        assertCurrentAccount();
        queryClient.setQueryData(['ic', 'courseGrades', preferredTermID, preferredTaskID], courses);

        const detailCourses = courses.filter((course) => course.hasDetail || course.hasAssignments);
        const detailsPromises = detailCourses.map(async (course) => {
          const detailRes = await getCourseGradeDetailResponse(
            course.sectionID,
            preferredTermID,
            preferredTaskID
          );
          if (!detailRes.ok) {
            return (
              queryClient.getQueryData<CourseGradeDetailResponse>([
                'ic',
                'courseGrade',
                course.sectionID,
                preferredTermID,
                preferredTaskID,
              ]) ?? null
            );
          }
          const detail = (await detailRes.json()) as CourseGradeDetailResponse;
          assertCurrentAccount();
          queryClient.setQueryData(
            ['ic', 'courseGrade', course.sectionID, preferredTermID, preferredTaskID],
            detail
          );
          return detail;
        });

        const details = await Promise.all(detailsPromises);
        assertCurrentAccount();
        const detailsMap = new Map(details.filter(Boolean).map((d) => [d!.task.sectionID, d!]));

        return { courses, detailsMap, availability, fallbackAssignments, fallbackAssignmentsError };
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}

export function useCourseGrade(sectionID: number) {
  const { preferredTermID, preferredTaskID } = usePreferences();

  return useQuery({
    queryKey: ['ic', 'courseGrade', sectionID, preferredTermID, preferredTaskID],
    staleTime: GRADE_STALE_TIME,
    queryFn: async () => {
      try {
        const res = await getCourseGradeDetailResponse(sectionID, preferredTermID, preferredTaskID);
        if (res.ok) {
          return (await res.json()) as CourseGradeDetailResponse;
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
    enabled: !!sectionID,
  });
}

export function useCourseTerms() {
  return useQuery({
    queryKey: ['ic', 'courseTerms'],
    staleTime: GRADE_STALE_TIME,
    queryFn: async () => {
      try {
        const client = getClient();
        const res = await client.ic.courseGrades.terms.$get();
        if (res.ok) {
          return (await res.json()) as CourseTermOption[];
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}

export function useUpdateResponsiveSchedule() {
  return useMutation({
    mutationFn: async (params: {
      responsiveOfferingID: number;
      calendarID: number;
      responsiveSessionID: number;
    }) => {
      try {
        const client = getClient();
        const res = await client.ic.responsiveSchedule.update.$post({
          query: {
            responsiveOfferingID: params.responsiveOfferingID.toString(),
            calendarID: params.calendarID.toString(),
            responsiveSessionID: params.responsiveSessionID.toString(),
          },
        });
        if (res.ok) {
          return (await res.json()) as { ok: boolean; message: string };
        }
        throw await createApiError(res);
      } catch (error) {
        if (error instanceof Error && 'status' in error) throw error;
        throw createNetworkError();
      }
    },
  });
}
