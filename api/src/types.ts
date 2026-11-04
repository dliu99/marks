export type Session = {
  cookie: string;
  baseURL: string;
  deviceId: string;
  deviceModel: string;
  deviceType: string;
  systemVersion: string;
  userID: number;
  personID: number;
};

export type Variables = {
  session: Session;
};

export type Announcement = {
  id: string;
  title: string;
  message: string;
  kind: 'info' | 'release' | 'warning';
  ctaLabel?: string;
  ctaUrl?: string;
  dismissible: boolean;
};

export type GradingTask = {
  taskID: number;
  taskName: string;
  hasAssignments: boolean;
  hasDetail: boolean;
  modifiedDate?: string | null;
  termID?: number;
  standardID?: number | null;
  score?: string | null;
  percent?: number | null;
  progressScore?: string | null;
  progressPercent?: number | null;
};

export type Course = {
  courseName: string;
  teacherDisplay: string;
  sectionID: number;
  structureID: number;
  endYear?: number;
  dropped: boolean;
  gradingTasks: GradingTask[];
};

export type Term = {
  termID: number;
  termName: string;
  termSeq: number;
  calendarID: number;
  startDate: string;
  endDate: string;
  courses: Course[];
};

export type Enrollment = {
  gradesEnabled?: boolean;
  assignmentsEnabled?: boolean;
  enrollmentID: number;
  calendarID?: number;
  displayName?: string;
  terms: Term[];
};

export type GradeAvailability = {
  gradesEnabled: boolean | null;
  assignmentsEnabled: boolean | null;
};

export type GradeOverview = {
  assignmentFallbackAllowed: boolean;
  courses: ExtractedCourse[];
  availability: GradeAvailability;
};

export type ExtractedCourse = {
  courseName: string;
  teacher: string;
  sectionID: number;
  calendarID: number;
  structureID: number;
  enrollmentID: number;
  score: string | undefined;
  percent: number | undefined;
  termName: string;
  taskName: string;
  hasAssignments: boolean;
  hasDetail: boolean;
  /** The course grades learning standards; score comes from its overall task. */
  standardsBased?: boolean;
};

export type CourseTermOption = {
  termID: number;
  termName: string;
  termSeq: number;
  calendarID: number;
  academicYear: string | null;
  startDate: string;
  endDate: string;
  tasks: CourseTermTaskOption[];
};

export type CourseTermTaskOption = {
  taskID: number;
  taskName: string;
  modifiedDate: string | null;
  score: string | null;
  percent: number | null;
  hasGrades: boolean;
  hasAssignments: boolean;
  hasDetail: boolean;
};

export type Assignment = {
  assignmentName: string;
  courseName?: string;
  objectSectionID: number;
  sectionID: number;
  dueDate: string;
  assignedDate: string;
  scoreModifiedDate: string;
  scorePoints: string | null;
  score: string | null;
  scorePercentage: string | null;
  scoringType: string | null;
  totalPoints: number;
  comments: string | null;
  feedback: string | null;
  notGraded: boolean;
};

export type AssignmentDetail = {
  curriculumAlignmentID: number;
  sectionID: number;
  startDate: string;
  endDate: string;
  active: boolean;
  objectID: number;
  notGraded: boolean;
  modifiedDate: string;
  releaseScoresTimeStamp: string;
  gradingAlignments: [
    {
      weight: number;
      scoringType: string | null;
      totalPoints: number;
      sectionID: number;
    },
  ];
  curriculumContent: {
    objectID: number;
    name: string;
    type: number;
    description: { blobID: string; content: string; skipSanitize: boolean } | null;
    curriculumBlocks: any[];
  };
  submissions: any[];
  scores: [
    {
      score: string | null;
      scorePoints: string | null;
      scorePercentage: string | null;
      comments: any;
    },
  ];
  hasRubricScores: boolean;
};

export type userAccount = {
  personID: number;
  username: string;
  firstName: string;
  lastName: string;
  homepage: string;
};

export type UserProfile = {
  gpa: { uw: string | null; w: string | null } | null;
  absences: number | null;
  tardies: number | null;
};

export type CourseGradeTerm = {
  calendarID: number;
  termID: number;
  structureID: number;
  termName: string;
  termScheduleID: number;
  termScheduleName: string;
  termSeq: number;
  isPrimary: boolean;
  startDate: string;
  endDate: string;
};

export type CourseGradeAssignment = {
  objectSectionID: number;
  assignmentName: string;
  sectionID: number;
  dueDate: string;
  assignedDate: string;
  scoreModifiedDate: string | null;
  termIDs: number[];
  score: string | null;
  scorePoints: string | null;
  scorePercentage: string | null;
  scoringType: string | null;
  totalPoints: number;
  comments: string | null;
  feedback: string | null;
  late: boolean | null;
  missing: boolean | null;
  dropped: boolean | null;
  incomplete: boolean | null;
  turnedIn: boolean | null;
  notGraded: boolean;
  multiplier: number;
};

export type CategoryProgress = {
  progressScore: string | null;
  progressPercent: number | null;
  progressPointsEarned: number | null;
  progressTotalPoints: number | null;
};

export type CourseGradeCategory = {
  groupID: number;
  name: string;
  weight: number;
  assignments: CourseGradeAssignment[];
  progress: CategoryProgress | null;
};

export type CourseGradeTask = {
  taskID: number;
  taskName: string;
  termID: number;
  termName: string;
  termSeq: number;
  courseName: string;
  sectionID: number;
  score: string | null;
  percent: number | null;
  progressScore: string | null;
  progressPercent: number | null;
  progressPointsEarned: number | null;
  progressTotalPoints: number | null;
  comments: string | null;
  hasAssignments: boolean;
  hasDetail: boolean;
  groupWeighted: boolean;
};

export type CourseStandard = {
  taskID: number;
  taskName: string;
  score: string | null;
  percent: number | null;
};

export type CourseGradeDetailResponse = {
  task: CourseGradeTask;
  categories: CourseGradeCategory[];
  /** Present for standards-based courses: each standard's current mark. */
  standards?: CourseStandard[];
};

export type CourseGradeAPIResponse = {
  terms: CourseGradeTerm[];
  details: {
    task: any;
    categories: any[];
    children: any;
  }[];
};

export type AppTool = {
  code: string; //student.responsive-schedule
  name: string;
  url: string;
  display: boolean;
  sequence: number;
};

export type App = {
  id: number;
  tools: AppTool[];
};

export type ResponsiveScheduleOffering = {
  responsiveOfferingID: number;
  responsiveOfferingName: string;
  description: string;
  maxStudents: number;
  courseNumber: string;
  sectionNumber: string;
  teacherDisplay: string;
  roomName: string;
  currentStudents: number;
  rosterID: number;
  teacherRequest: boolean;
  reason: string;
};

export type ResponsiveScheduleSession = {
  responsiveSessionID: number;
  sessionName: string;
  // IC sends local dates like "2026-09-29T00:00:00.000-07".
  startDate: string;
  endDate: string;
  sessionOpen: boolean;
  offerings: ResponsiveScheduleOffering[];
};
