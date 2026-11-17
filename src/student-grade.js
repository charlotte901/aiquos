export function studentGrade(score) {
 if (!Number.isFinite(score)) return null;
 return score >= 90 ? "S" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "D";
}
