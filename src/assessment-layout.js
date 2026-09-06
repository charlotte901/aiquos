export const ASSESSMENT_ART = "/assets/assessment-reference.png";
// Source pixels include the supplied lettering, illustration and surface lighting.
export const ASSESSMENTS = [
  {
    id: "comprehensive",
    title: "综合测评",
    subtitle: "Comprehensive Assessment",
    crop: [81, 343, 363, 420],
  },
  {
    id: "objective",
    title: "客观题测评",
    subtitle: "Objective Test Assessment",
    crop: [465, 343, 355, 420],
  },
  {
    id: "conversation",
    title: "对话式测评",
    subtitle: "Conversational Assessment",
    crop: [841, 343, 357, 420],
  },
  {
    id: "practical",
    title: "实操任务测评",
    subtitle: "Practical Task Assessment",
    crop: [1220, 343, 363, 420],
  },
];
export function getAssessmentLayout(width, height) {
  const compact = width < 760;
  const unit = Math.min(width / 1672, Math.max(height, 560) / 941);
  return { compact, unit, variables: { "--assessment-unit": unit } };
}
