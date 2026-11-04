// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import {
  getAssignmentPointInputValue,
  getAssignmentPointValue,
  isNonPointsScoringType,
} from './assignment-score';

describe('assignment score normalization', () => {
  test('prefers the explicit IC point value', () => {
    expect(
      getAssignmentPointValue({
        score: '2',
        scorePoints: '9.75',
        scorePercentage: '65',
        totalPoints: 15,
        scoringType: 'm',
      })
    ).toBe(9.75);
  });

  test('converts IC percentage to equivalent points for mark scoring', () => {
    const assignment = {
      score: '2',
      scorePoints: null,
      scorePercentage: '65.0',
      totalPoints: 15,
      scoringType: 'm',
    };

    expect(getAssignmentPointValue(assignment)).toBe(9.75);
    expect(getAssignmentPointInputValue(assignment)).toBe('9.75');
  });

  test('does not guess how to convert a non-point mark without an IC percentage', () => {
    expect(
      getAssignmentPointValue({
        score: '2',
        scorePoints: null,
        scorePercentage: null,
        totalPoints: 15,
        scoringType: 'm',
      })
    ).toBeNull();
  });

  test('normalizes IC point codes while treating an empty type as unspecified', () => {
    expect(isNonPointsScoringType(' P ')).toBe(false);
    expect(isNonPointsScoringType('')).toBe(false);
    expect(isNonPointsScoringType('m')).toBe(true);
  });
});
