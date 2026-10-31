import { describe, expect, test } from "bun:test";

import { findTokenViolations } from "./shared/design-tokens.ts";

const categories = (text: string, allowed?: string[]) =>
  findTokenViolations(text, allowed).map((violation) => violation.category);

describe("design-tokens", () => {
  test("flags bracketed values", () => {
    expect(categories("w-[42rem] h-[calc(100%-1px)] grid-cols-[1fr_2fr] top-[3px]")).toEqual([
      "bracket",
      "bracket",
      "bracket",
      "bracket",
    ]);
    expect(categories("leading-[1.2] tracking-[-0.02em] font-[550]")).toHaveLength(3);
  });

  test("allows the documented exception and extra ones", () => {
    expect(categories("grid-cols-[minmax(0,1fr)]")).toEqual([]);
    expect(categories("sm:grid-cols-[minmax(0,1fr)]")).toEqual([]);
    expect(categories("w-[10px]", ["w-[10px]"])).toEqual([]);
    expect(categories("grid-cols-[minmax(0,2fr)]")).toEqual(["bracket"]);
  });

  test("flags raw palette colours", () => {
    expect(categories("text-red-500 bg-white border-black/50 hover:ring-blue-600")).toEqual([
      "palette",
      "palette",
      "palette",
      "palette",
    ]);
    expect(categories("bg-background text-foreground bg-muted")).toEqual([]);
  });

  test("flags type sizes outside the role scale and suggests the role", () => {
    const [xs, sm, xl, big] = findTokenViolations("text-xs text-sm text-xl text-3xl");
    expect(xs?.message).toContain("text-meta");
    expect(sm?.message).toContain("text-body");
    expect(xl?.message).toContain("text-title");
    expect(big?.message).toContain("text-display");
    expect(categories("text-title text-body text-meta text-code text-muted-foreground")).toEqual([]);
  });

  test("flags spacing outside the allowed steps", () => {
    expect(categories("p-5 px-7 mt-10 gap-12 gap-x-2.5 space-y-3.5 -ml-5")).toEqual([
      "spacing",
      "spacing",
      "spacing",
      "spacing",
      "spacing",
      "spacing",
      "spacing",
    ]);
    expect(findTokenViolations("p-5")[0]?.message).toContain("p-4");
    expect(categories("p-0 p-0.5 gap-1.5 px-pane gap-field -mt-2 mx-auto p-px gap-x-8")).toEqual([]);
    expect(categories("size-5 h-10 w-12")).toEqual([]);
  });

  test("strips variant prefixes, including bracketed ones", () => {
    expect(categories("data-[state=open]:bg-muted has-[>svg]:gap-2")).toEqual([]);
    expect(categories("group-data-[x=y]/name:p-4 dark:bg-card !p-4 sm:-mt-4")).toEqual([]);
    expect(categories("sm:p-5 hover:text-red-500 dark:!text-sm")).toEqual([
      "spacing",
      "palette",
      "textSize",
    ]);
    expect(categories("data-[a=b:c]:w-[3px]")).toEqual(["bracket"]);
    expect(categories("[&>svg]:size-4")).toEqual([]);
  });
});
