import { describe, expect, it } from "vitest";
import { paperFromBook, paperSchema, paperUpdate } from "./paper-form";

const base = paperFromBook({ paper: null });

describe("paper details form (BS-34)", () => {
  it("starts as a conference paper for sale", () => {
    expect(base).toMatchObject({ access: "sale", eventType: "conference", externalUrl: "" });
    expect(paperSchema.safeParse(base).success).toBe(true);
  });

  it("needs a safe publisher link for a paper read elsewhere", () => {
    const external = { ...base, access: "external" as const };
    expect(paperSchema.safeParse(external).error?.issues[0]).toMatchObject({ path: ["externalUrl"] });
    expect(paperSchema.safeParse({ ...external, externalUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(paperSchema.safeParse({ ...external, externalUrl: "https://doi.org/10.1000/1" }).success).toBe(true);
  });

  it("sends every field, clearing an empty link", () => {
    expect(paperUpdate({ ...base, venue: "  NMS Conference ", externalUrl: " " })).toEqual({
      paper: {
        access: "sale",
        eventType: "conference",
        venue: "NMS Conference",
        location: "",
        publisher: "",
        pages: "",
        doi: "",
        externalUrl: null,
      },
    });
  });
});
