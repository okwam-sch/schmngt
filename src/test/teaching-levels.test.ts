import { describe, it, expect } from "vitest";
import { matchTeachingPairs, teachingLevelError } from "@/lib/teaching-levels";

const classes = [
  { name: "Basic 1", levelCode: "primary" },
  { name: "JHS 1", levelCode: "jhs" },
];
const subjects = [
  { name: "Mathematics", levelCode: "primary" },
  { name: "Mathematics", levelCode: "jhs" },
  { name: "Integrated Science", levelCode: "jhs" },
];

describe("teaching level matching", () => {
  it("only pairs subjects with classes of the same level", () => {
    const r = matchTeachingPairs(["Basic 1", "JHS 1"], ["Mathematics", "Integrated Science"], classes, subjects);
    expect(r.pairs).toEqual([
      { class_name: "Basic 1", subject: "Mathematics" },
      { class_name: "JHS 1", subject: "Mathematics" },
      { class_name: "JHS 1", subject: "Integrated Science" },
    ]);
    expect(teachingLevelError(r)).toBeNull();
  });
  it("rejects a subject not offered at the class level", () => {
    const r = matchTeachingPairs(["Basic 1"], ["Integrated Science"], classes, subjects);
    expect(r.pairs).toEqual([]);
    expect(teachingLevelError(r)).toMatch(/Integrated Science/);
  });
});
