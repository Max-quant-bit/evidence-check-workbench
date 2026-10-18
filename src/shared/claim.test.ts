import { describe, expect, it } from "vitest";
import { evidenceClaimSchema } from "./claim.js";

const validClaim = {
  side: "affirmative",
  originalText: "The fictional pilot served 120 people in 2024.",
  claim: "A fictional pilot served 120 people in 2024.",
  entities: ["Fictional pilot"],
  numbers: ["120"],
  dates: ["2024"],
  allegedSource: null,
  documentName: "fictional-sample.txt",
  page: null,
  paragraph: 1,
};

describe("evidenceClaimSchema", () => {
  it("accepts the documented extraction shape", () => {
    expect(evidenceClaimSchema.parse(validClaim)).toEqual(validClaim);
  });

  it("rejects unknown fields and invalid locations", () => {
    expect(() =>
      evidenceClaimSchema.parse({ ...validClaim, verified: true }),
    ).toThrow();
    expect(() =>
      evidenceClaimSchema.parse({ ...validClaim, paragraph: 0 }),
    ).toThrow();
  });
});
