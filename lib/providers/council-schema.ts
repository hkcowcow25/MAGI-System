/** Used only when a persona explicitly enables Council structured output. */
export const COUNCIL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    proposal: { type: "string" },
    rationale: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
  },
  required: ["proposal", "rationale", "risks", "missing_information"],
  additionalProperties: false,
};
