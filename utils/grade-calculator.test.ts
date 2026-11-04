// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import type { CourseGradeAssignment, CourseGradeCategory } from '@/api/src/types';
import {
  applyWhatIfModifications,
  calculateCategoryPercent,
  calculatePercentImpact,
  calculatePercentImpactFromRaw,
  dropAssignmentFromCalculation,
  getRemainingCategoryWeight,
  getHiddenAssignmentMaxPoints,
  isCountedGradeAssignment,
  recalculateGrade,
  sanitizeWhatIfModifications,
} from './grade-calculator';

function createAssignment(
  objectSectionID: number,
  score: string | null,
  totalPoints: number,
  overrides: Partial<CourseGradeAssignment> = {}
): CourseGradeAssignment {
  const scoreNum = score === null ? null : Number.parseFloat(score);
  return {
    objectSectionID,
    assignmentName: `Assignment ${objectSectionID}`,
    sectionID: 1,
    dueDate: '2026-01-01T00:00:00.000Z',
    assignedDate: '2026-01-01T00:00:00.000Z',
    scoreModifiedDate: '2026-01-01T00:00:00.000Z',
    termIDs: [1],
    score,
    scorePoints: score,
    scorePercentage:
      scoreNum !== null && Number.isFinite(scoreNum)
        ? ((scoreNum / totalPoints) * 100).toFixed(2)
        : null,
    scoringType: 'p',
    totalPoints,
    comments: null,
    feedback: null,
    late: null,
    missing: null,
    dropped: null,
    incomplete: null,
    turnedIn: null,
    notGraded: false,
    multiplier: 1,
    ...overrides,
  };
}

function createCategory(
  groupID: number,
  weight: number,
  assignments: CourseGradeAssignment[]
): CourseGradeCategory {
  return {
    groupID,
    name: `Category ${groupID}`,
    weight,
    assignments,
    progress: null,
  };
}

describe('sanitizeWhatIfModifications', () => {
  test('removes no-op drop toggles and numerically equivalent score edits', () => {
    const categories = [
      createCategory(1, 100, [createAssignment(1, '9', 10), createAssignment(2, '8', 10)]),
    ];
    const modifications = new Map([
      [1, { dropped: false }],
      [2, { score: '8.0', totalPoints: 10 }],
    ]);

    expect(sanitizeWhatIfModifications(categories, modifications).size).toBe(0);
  });

  test('keeps meaningful edits', () => {
    const categories = [createCategory(1, 100, [createAssignment(1, '9', 10)])];
    const modifications = new Map([[1, { score: '10', dropped: true }]]);

    expect(sanitizeWhatIfModifications(categories, modifications)).toEqual(modifications);
  });
});

describe('reverted drop calculations', () => {
  test('returns to the original unweighted percent after a drop is undone', () => {
    const categories = [
      createCategory(1, 100, [createAssignment(1, '8', 10), createAssignment(2, '10', 10)]),
    ];
    const baseline = recalculateGrade(
      applyWhatIfModifications(categories, new Map()),
      false
    ).percent;
    const dropped = recalculateGrade(
      applyWhatIfModifications(categories, new Map([[1, { dropped: true }]])),
      false
    ).percent;
    const reverted = recalculateGrade(
      applyWhatIfModifications(
        categories,
        sanitizeWhatIfModifications(categories, new Map([[1, { dropped: false }]]))
      ),
      false
    ).percent;

    expect(baseline).toBe(90);
    expect(dropped).toBe(100);
    expect(reverted).toBe(baseline);
  });

  test('returns to the original weighted percent after a drop is undone', () => {
    const categories = [
      createCategory(1, 50, [createAssignment(1, '8', 10)]),
      createCategory(2, 50, [createAssignment(2, '9', 10)]),
    ];
    const baseline = recalculateGrade(
      applyWhatIfModifications(categories, new Map()),
      true
    ).percent;
    const dropped = recalculateGrade(
      applyWhatIfModifications(categories, new Map([[1, { dropped: true }]])),
      true
    ).percent;
    const reverted = recalculateGrade(
      applyWhatIfModifications(
        categories,
        sanitizeWhatIfModifications(categories, new Map([[1, { dropped: false }]]))
      ),
      true
    ).percent;

    expect(baseline).toBe(85);
    expect(dropped).toBe(90);
    expect(reverted).toBe(baseline);
  });
});

describe('multiplier handling', () => {
  test('scales both earned and denominator points', () => {
    const categories = [
      createCategory(1, 100, [
        createAssignment(1, '50', 100, { multiplier: 0.5 }),
        createAssignment(2, '100', 100),
      ]),
    ];

    const recalculated = recalculateGrade(applyWhatIfModifications(categories, new Map()), false);

    expect(recalculated.pointsEarned).toBe(125);
    expect(recalculated.totalPoints).toBe(150);
    expect(recalculated.percent).toBeCloseTo(83.3333333333);
  });
});

describe('non-points scoring', () => {
  const markAssignment = () =>
    createAssignment(1, '2', 15, {
      scorePoints: null,
      scorePercentage: '65.0',
      scoringType: 'm',
    });
  const markCategory = () => ({
    ...createCategory(1, 100, [markAssignment()]),
    progress: {
      progressScore: 'D',
      progressPercent: 65,
      progressPointsEarned: 9.75,
      progressTotalPoints: 15,
    },
  });

  test('uses the IC percentage as equivalent points instead of treating the mark as points', () => {
    const recalculated = recalculateGrade(
      applyWhatIfModifications([markCategory()], new Map()),
      false
    );

    expect(recalculated.pointsEarned).toBe(9.75);
    expect(recalculated.totalPoints).toBe(15);
    expect(recalculated.percent).toBe(65);
    expect(isCountedGradeAssignment(markAssignment())).toBe(true);
  });

  test('does not invent a point value when IC supplies only a raw mark', () => {
    const assignment = markAssignment();
    assignment.scorePercentage = null;

    const recalculated = recalculateGrade(
      applyWhatIfModifications([createCategory(1, 100, [assignment])], new Map()),
      false
    );

    expect(isCountedGradeAssignment(assignment)).toBe(false);
    expect(recalculated.pointsEarned).toBe(0);
    expect(recalculated.totalPoints).toBe(0);
  });

  test('applies point-based what-if edits against the IC-equivalent original value', () => {
    const recalculated = recalculateGrade(
      applyWhatIfModifications([markCategory()], new Map([[1, { score: '12' }]])),
      false
    );

    expect(recalculated.pointsEarned).toBe(12);
    expect(recalculated.totalPoints).toBe(15);
    expect(recalculated.percent).toBe(80);
  });

  test('preserves mark semantics for drop-only changes', () => {
    const modified = applyWhatIfModifications(
      [markCategory()],
      new Map([[1, { dropped: true }]])
    )[0].assignments[0];

    expect(modified).toMatchObject({
      score: '2',
      scorePoints: null,
      scorePercentage: '65.0',
      scoringType: 'm',
      dropped: true,
    });
  });

  test('treats the equivalent point value as a no-op edit', () => {
    const sanitized = sanitizeWhatIfModifications(
      [markCategory()],
      new Map([[1, { score: '9.75' }]])
    );

    expect(sanitized.size).toBe(0);
  });

  test('calculates drop impact from IC-equivalent points', () => {
    expect(calculatePercentImpactFromRaw(markAssignment(), [markCategory()], false, 65)).toBe(-65);
  });
});

describe('missing assignment handling', () => {
  test('counts a missing assignment with total points as zero in unweighted courses', () => {
    const categories = [
      createCategory(1, 100, [
        createAssignment(1, '10', 10),
        createAssignment(2, null, 10, {
          scorePoints: null,
          scorePercentage: null,
          missing: true,
        }),
      ]),
    ];

    const recalculated = recalculateGrade(applyWhatIfModifications(categories, new Map()), false);

    expect(recalculated.pointsEarned).toBe(10);
    expect(recalculated.totalPoints).toBe(20);
    expect(recalculated.percent).toBe(50);
  });

  test('counts a missing assignment with total points as zero in weighted courses', () => {
    const categories = [
      createCategory(1, 50, [
        createAssignment(1, '10', 10),
        createAssignment(2, null, 10, {
          scorePoints: null,
          scorePercentage: null,
          missing: true,
        }),
      ]),
      createCategory(2, 50, [createAssignment(3, '10', 10)]),
    ];

    const recalculated = recalculateGrade(applyWhatIfModifications(categories, new Map()), true);

    expect(recalculated.pointsEarned).toBe(20);
    expect(recalculated.totalPoints).toBe(30);
    expect(recalculated.percent).toBe(75);
  });

  test('does not count null-score assignments unless they are missing', () => {
    const categories = [
      createCategory(1, 100, [
        createAssignment(1, '10', 10),
        createAssignment(2, null, 10, {
          scorePoints: null,
          scorePercentage: null,
          missing: null,
        }),
      ]),
    ];

    const recalculated = recalculateGrade(applyWhatIfModifications(categories, new Map()), false);

    expect(recalculated.pointsEarned).toBe(10);
    expect(recalculated.totalPoints).toBe(10);
    expect(recalculated.percent).toBe(100);
  });

  test('does not count empty or nonnumeric scores unless the assignment is missing', () => {
    expect(isCountedGradeAssignment(createAssignment(1, '', 10))).toBe(false);
    expect(isCountedGradeAssignment(createAssignment(2, 'excused', 10))).toBe(false);
    expect(isCountedGradeAssignment(createAssignment(3, '', 10, { missing: true }))).toBe(true);
  });
});

describe('final grade selected assignment handling', () => {
  test('drops a counted selected assignment before final-grade recalculation', () => {
    const categories = [
      createCategory(1, 100, [
        createAssignment(1, '80', 100),
        createAssignment(2, '0', 40, { assignmentName: 'Final Exam' }),
      ]),
    ];
    const modified = applyWhatIfModifications(categories, new Map());
    const withoutSelectedFinal = dropAssignmentFromCalculation(modified, 2);

    expect(recalculateGrade(modified, false).percent).toBeCloseTo(57.1428571429);
    expect(recalculateGrade(withoutSelectedFinal, false).percent).toBe(80);
    expect(withoutSelectedFinal[0].assignments[1]).toMatchObject({
      score: null,
      scorePoints: null,
      scorePercentage: null,
      dropped: true,
    });
  });
});

describe('api progress baseline recomputation', () => {
  test('shows the missing maximum without treating edits as hidden assignments', () => {
    const categories = [
      {
        ...createCategory(1, 40, [createAssignment(1, '40', 45)]),
        progress: {
          progressPercent: 77.78,
          progressPointsEarned: 70,
          progressTotalPoints: 90,
        },
      },
    ];

    const original = applyWhatIfModifications(categories, new Map());
    const edited = applyWhatIfModifications(categories, new Map([[1, { score: '45' }]]));
    expect(getHiddenAssignmentMaxPoints(original[0])).toBe(45);
    expect(getHiddenAssignmentMaxPoints(edited[0])).toBe(45);
  });

  test('does not add a placeholder when IC and returned assignments agree', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '4', 4)]),
        progress: {
          progressPercent: 100,
          progressPointsEarned: 4,
          progressTotalPoints: 4,
        },
      },
    ];

    expect(
      getHiddenAssignmentMaxPoints(applyWhatIfModifications(categories, new Map())[0])
    ).toBeNull();
  });

  test('does not invent a hidden assignment when IC totals are lower', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '8', 10)]),
        progress: {
          progressPercent: 75,
          progressPointsEarned: 6,
          progressTotalPoints: 8,
        },
      },
    ];

    expect(
      getHiddenAssignmentMaxPoints(applyWhatIfModifications(categories, new Map())[0])
    ).toBeNull();
  });

  test('does not turn bonus points without a maximum into a hidden assignment', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '8', 10)]),
        progress: {
          progressPercent: 130,
          progressPointsEarned: 13,
          progressTotalPoints: 10,
        },
      },
    ];

    expect(
      getHiddenAssignmentMaxPoints(applyWhatIfModifications(categories, new Map())[0])
    ).toBeNull();
  });

  test('reaches 100% after editing full credit when IC truncated the original percent', () => {
    const categories = [
      {
        ...createCategory(1, 0, [
          createAssignment(1, '0', 4),
          createAssignment(2, '4', 4),
          createAssignment(3, '4', 4),
        ]),
        progress: {
          progressPercent: 66.66,
          progressPointsEarned: 8,
          progressTotalPoints: 12,
        },
      },
    ];
    const baseline = {
      baselinePercent: 66.66,
      baselinePointsEarned: 8,
      baselineTotalPoints: 12,
    };

    const original = applyWhatIfModifications(categories, new Map());
    expect(calculateCategoryPercent(original[0])).toBe(66.66);
    expect(recalculateGrade(original, false, baseline).percent).toBe(66.66);

    const edited = applyWhatIfModifications(categories, new Map([[1, { score: '4' }]]));
    expect(calculateCategoryPercent(edited[0])).toBe(100);
    expect(recalculateGrade(edited, false, baseline).percent).toBe(100);
  });

  test('preserves a material IC offset from the visible assignment points', () => {
    const categories = [
      {
        ...createCategory(1, 40, [createAssignment(1, '8', 10)]),
        progress: {
          progressPercent: 75,
          progressPointsEarned: 8,
          progressTotalPoints: 10,
        },
      },
    ];
    const edited = applyWhatIfModifications(categories, new Map([[1, { score: '9' }]]));

    expect(calculateCategoryPercent(edited[0])).toBe(85);
  });

  test('keeps the API task percent as the no-change ground truth', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
    ];

    const recalculated = recalculateGrade(applyWhatIfModifications(categories, new Map()), false, {
      baselinePercent: 80.5,
      baselinePointsEarned: 80,
      baselineTotalPoints: 100,
    });

    expect(recalculated.percent).toBe(80.5);
  });

  test('uses category progress totals as the baseline for unweighted what-if changes', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '50', 100)]),
        progress: {
          progressScore: '55/100',
          progressPercent: 55,
          progressPointsEarned: 55,
          progressTotalPoints: 100,
        },
      },
    ];

    const recalculated = recalculateGrade(
      applyWhatIfModifications(categories, new Map([[1, { score: '60' }]])),
      false
    );

    expect(recalculated.pointsEarned).toBe(65);
    expect(recalculated.totalPoints).toBe(100);
    expect(recalculated.percent).toBe(65);
  });

  test('applies unweighted what-if deltas to API task totals', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '50', 100)]),
        progress: {
          progressScore: '50/100',
          progressPercent: 50,
          progressPointsEarned: 50,
          progressTotalPoints: 100,
        },
      },
    ];

    const recalculated = recalculateGrade(
      applyWhatIfModifications(categories, new Map([[1, { score: '60' }]])),
      false,
      {
        baselinePercent: 52,
        baselinePointsEarned: 52,
        baselineTotalPoints: 100,
      }
    );

    expect(recalculated.pointsEarned).toBe(62);
    expect(recalculated.totalPoints).toBe(100);
    expect(recalculated.percent).toBe(62);
  });

  test('uses category progress totals as the baseline for weighted what-if changes', () => {
    const categories = [
      {
        ...createCategory(1, 60, [createAssignment(1, '50', 100)]),
        progress: {
          progressScore: '55/100',
          progressPercent: 55,
          progressPointsEarned: 55,
          progressTotalPoints: 100,
        },
      },
      {
        ...createCategory(2, 40, [createAssignment(2, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
    ];

    const recalculated = recalculateGrade(
      applyWhatIfModifications(categories, new Map([[1, { score: '60' }]])),
      true
    );

    expect(recalculated.percent).toBe(71);
  });

  test('applies weighted what-if deltas to API task percent', () => {
    const categories = [
      {
        ...createCategory(1, 50, [createAssignment(1, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
      {
        ...createCategory(2, 50, [createAssignment(2, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
    ];

    const recalculated = recalculateGrade(
      applyWhatIfModifications(categories, new Map([[1, { score: '90' }]])),
      true,
      { baselinePercent: 81 }
    );

    expect(recalculated.percent).toBe(86);
  });

  test('renormalizes weighted API baseline when adding a new category', () => {
    const categories = [
      {
        ...createCategory(1, 50, [createAssignment(1, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
      {
        ...createCategory(2, 50, [createAssignment(2, '90', 100)]),
        progress: {
          progressScore: '90/100',
          progressPercent: 90,
          progressPointsEarned: 90,
          progressTotalPoints: 100,
        },
      },
    ];
    const modified = applyWhatIfModifications(
      categories,
      new Map(),
      [
        {
          objectSectionID: -1,
          groupID: -1,
          assignmentName: 'Final Exam',
          score: '100',
          totalPoints: 100,
        },
      ],
      [{ groupID: -1, name: 'Final Exam', weight: 50 }]
    );

    const recalculated = recalculateGrade(modified, true, { baselinePercent: 86 });

    expect(recalculated.percent).toBeCloseTo(90.6666666667);
  });

  test('uses relative weights literally instead of treating them like missing percent weights', () => {
    const categories = [
      {
        ...createCategory(1, 1, [createAssignment(1, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
      {
        ...createCategory(2, 1, [createAssignment(2, '90', 100)]),
        progress: {
          progressScore: '90/100',
          progressPercent: 90,
          progressPointsEarned: 90,
          progressTotalPoints: 100,
        },
      },
    ];
    const withPerfectFinal = applyWhatIfModifications(
      categories,
      new Map(),
      [
        {
          objectSectionID: -1,
          groupID: -1,
          assignmentName: 'Final Exam',
          score: '100',
          totalPoints: 100,
        },
      ],
      [{ groupID: -1, name: 'Final Exam', weight: 1 }]
    );
    const withZeroFinal = applyWhatIfModifications(
      categories,
      new Map(),
      [
        {
          objectSectionID: -1,
          groupID: -1,
          assignmentName: 'Final Exam',
          score: '0',
          totalPoints: 100,
        },
      ],
      [{ groupID: -1, name: 'Final Exam', weight: 1 }]
    );

    expect(recalculateGrade(withPerfectFinal, true, { baselinePercent: 85 }).percent).toBeCloseTo(
      90
    );
    expect(recalculateGrade(withZeroFinal, true, { baselinePercent: 85 }).percent).toBeCloseTo(
      56.6666666667
    );
  });

  test('adds an assignment inside a weighted category without changing other category weights', () => {
    const categories = [
      {
        ...createCategory(1, 60, [createAssignment(1, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
      {
        ...createCategory(2, 40, [createAssignment(2, '90', 100)]),
        progress: {
          progressScore: '90/100',
          progressPercent: 90,
          progressPointsEarned: 90,
          progressTotalPoints: 100,
        },
      },
    ];
    const modified = applyWhatIfModifications(categories, new Map(), [
      {
        objectSectionID: -1,
        groupID: 1,
        assignmentName: 'Extra Credit',
        score: '100',
        totalPoints: 100,
      },
    ]);

    expect(recalculateGrade(modified, true, { baselinePercent: 84 }).percent).toBeCloseTo(90);
  });

  test('keeps final-calculator interpolation exact for weighted categories', () => {
    const categories = [
      {
        ...createCategory(1, 50, [createAssignment(1, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
      {
        ...createCategory(2, 50, [createAssignment(2, '90', 100)]),
        progress: {
          progressScore: '90/100',
          progressPercent: 90,
          progressPointsEarned: 90,
          progressTotalPoints: 100,
        },
      },
    ];
    const createFinalCategories = (score: string) =>
      applyWhatIfModifications(
        categories,
        new Map(),
        [
          {
            objectSectionID: -1,
            groupID: -1,
            assignmentName: 'Final Exam',
            score,
            totalPoints: 100,
          },
        ],
        [{ groupID: -1, name: 'Final Exam', weight: 50 }]
      );
    const gradeWithZero = recalculateGrade(createFinalCategories('0'), true, {
      baselinePercent: 85,
    }).percent;
    const gradeWithFullCredit = recalculateGrade(createFinalCategories('100'), true, {
      baselinePercent: 85,
    }).percent;
    const scoreForNinety = (90 - gradeWithZero) / ((gradeWithFullCredit - gradeWithZero) / 100);

    expect(scoreForNinety).toBeCloseTo(100);
  });

  test('edits a missing assignment against API progress totals without adding denominator twice', () => {
    const categories = [
      {
        ...createCategory(1, 100, [
          createAssignment(1, '10', 10),
          createAssignment(2, null, 10, {
            scorePoints: null,
            scorePercentage: null,
            missing: true,
          }),
        ]),
        progress: {
          progressScore: '10/20',
          progressPercent: 50,
          progressPointsEarned: 10,
          progressTotalPoints: 20,
        },
      },
    ];

    const recalculated = recalculateGrade(
      applyWhatIfModifications(categories, new Map([[2, { score: '5' }]])),
      false
    );

    expect(recalculated.pointsEarned).toBe(15);
    expect(recalculated.totalPoints).toBe(20);
    expect(recalculated.percent).toBe(75);
  });
});

describe('category weight suggestions', () => {
  test('defaults positive whole-number totals to percentage remaining weight', () => {
    expect(getRemainingCategoryWeight(2)).toBe(98);
  });

  test('returns remaining weight for percentage and fractional scales', () => {
    expect(getRemainingCategoryWeight(80)).toBe(20);
    expect(getRemainingCategoryWeight(0.8)).toBeCloseTo(0.2);
  });
});

describe('category progress display', () => {
  test('uses API category percent as the no-change ground truth', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '55', 100)]),
        progress: {
          progressScore: '55/100',
          progressPercent: 55.5,
          progressPointsEarned: 55,
          progressTotalPoints: 100,
        },
      },
    ];
    const modified = applyWhatIfModifications(categories, new Map());

    expect(calculateCategoryPercent(modified[0])).toBe(55.5);
  });

  test('applies what-if deltas to API category percent', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '55', 100)]),
        progress: {
          progressScore: '55/100',
          progressPercent: 55.5,
          progressPointsEarned: 55,
          progressTotalPoints: 100,
        },
      },
    ];
    const modified = applyWhatIfModifications(categories, new Map([[1, { score: '65' }]]));

    expect(calculateCategoryPercent(modified[0])).toBe(65.5);
  });

  test('does not fall back to API category percent after removing all counted points', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '55', 100)]),
        progress: {
          progressScore: '55/100',
          progressPercent: 55.5,
          progressPointsEarned: 55,
          progressTotalPoints: 100,
        },
      },
    ];
    const modified = applyWhatIfModifications(categories, new Map([[1, { dropped: true }]]));

    expect(calculateCategoryPercent(modified[0])).toBeNull();
  });
});

describe('impact calculations', () => {
  test('matches the displayed course percent change when dropping a counted assignment', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '90', 100), createAssignment(2, '70', 100)]),
        progress: {
          progressScore: '160/200',
          progressPercent: 80,
          progressPointsEarned: 160,
          progressTotalPoints: 200,
        },
      },
    ];
    const modified = applyWhatIfModifications(categories, new Map());
    const baselinePercent = 80;

    expect(
      calculatePercentImpact(modified[0].assignments[0], modified, false, baselinePercent)
    ).toBe(-10);
    expect(
      calculatePercentImpactFromRaw(
        categories[0].assignments[0],
        categories,
        false,
        baselinePercent
      )
    ).toBe(-10);
  });

  test('uses adjusted API-backed totals for category percent display', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '50', 100)]),
        progress: {
          progressScore: '55/100',
          progressPercent: 55,
          progressPointsEarned: 55,
          progressTotalPoints: 100,
        },
      },
    ];
    const modified = applyWhatIfModifications(categories, new Map([[1, { score: '60' }]]));

    expect(calculateCategoryPercent(modified[0])).toBe(65);
  });

  test('anchors percent impact to API task baseline', () => {
    const categories = [
      {
        ...createCategory(1, 100, [createAssignment(1, '80', 100)]),
        progress: {
          progressScore: '80/100',
          progressPercent: 80,
          progressPointsEarned: 80,
          progressTotalPoints: 100,
        },
      },
    ];
    const modified = applyWhatIfModifications(categories, new Map());
    const baseline = {
      baselinePercent: 82,
      baselinePointsEarned: 82,
      baselineTotalPoints: 100,
    };

    expect(calculatePercentImpact(modified[0].assignments[0], modified, false, 82, baseline)).toBe(
      -82
    );
    expect(
      calculatePercentImpactFromRaw(categories[0].assignments[0], categories, false, 82, baseline)
    ).toBe(-82);
  });
});
