import { describe, it, expect } from "vitest";
import { amountForLevel, appliesToLevel, levelOfClass, subjectsForClass } from "@/lib/education-levels";

const classes = [{ name: "JHS 1", levelCode: "JHS" }, { name: "SHS 1", levelCode: "SHS" }];
const subjects = [{ name: "Maths", levelCode: "JHS" }, { name: "Elective Physics", levelCode: "SHS" }];

describe("education level scoping", () => {
  it("a class offers only subjects of its own level", () => {
    expect(subjectsForClass(subjects, classes, "JHS 1")).toEqual(["Maths"]);
  });
  it("finds a class level case-insensitively", () => {
    expect(levelOfClass(classes, "shs 1")).toBe("SHS");
  });
  it("an unscoped charge applies to every level", () => {
    expect(appliesToLevel("", "JHS")).toBe(true);
  });
  it("a scoped charge does not apply to other levels", () => {
    expect(appliesToLevel("SHS:800", "JHS")).toBe(false);
  });
  it("a level amount overrides the base amount", () => {
    expect(amountForLevel({ amount: 500, levels: "JHS,SHS:800" }, "SHS")).toBe(800);
    expect(amountForLevel({ amount: 500, levels: "JHS,SHS:800" }, "JHS")).toBe(500);
  });
});
