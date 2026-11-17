import { gradeOverall } from '../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs';
export function studentGrade(score) {
  return Number.isFinite(score) ? gradeOverall(score) : null;
}
