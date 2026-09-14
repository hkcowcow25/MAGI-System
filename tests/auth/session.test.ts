import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessCodeMatches,
  createSessionToken,
  isAccessConfigured,
  toAsciiHyphens,
  verifySessionToken,
} from "@/lib/auth/session";

describe("web session helpers", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.MAGI_ACCESS_CODE = "correct-horse";
    process.env.MAGI_SESSION_SECRET = "session-secret-for-tests";
    process.env.MAGI_MOCK_MODE = "true";
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("reports accessConfigured when MAGI_ACCESS_CODE set", () => {
    expect(isAccessConfigured()).toBe(true);
    delete process.env.MAGI_ACCESS_CODE;
    expect(isAccessConfigured()).toBe(false);
  });

  it("creates and verifies a signed session token", () => {
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken("garbage")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it("rejects expired tokens", () => {
    const token = createSessionToken(Date.now() - 20 * 60 * 60 * 1000);
    expect(verifySessionToken(token)).toBe(false);
  });

  it("matches access codes with timing-safe compare", () => {
    expect(accessCodeMatches("correct-horse")).toBe(true);
    expect(accessCodeMatches("wrong")).toBe(false);
  });

  it("toAsciiHyphens replaces Unicode dashes", () => {
    expect(toAsciiHyphens("A \u2014 B \u2013 C")).toBe("A - B - C");
    expect(toAsciiHyphens("MELCHIOR \u2014 APPROVE")).toBe("MELCHIOR - APPROVE");
  });
});

describe("web deliberate gate", () => {
  const prev = { ...process.env };
  let cookieStore: Map<string, string>;

  beforeEach(() => {
    process.env.MAGI_ACCESS_CODE = "web-pass";
    process.env.MAGI_SESSION_SECRET = "session-secret-for-tests";
    process.env.MAGI_MOCK_MODE = "true";
    process.env.MAGI_API_KEY = "test-secret";
    cookieStore = new Map();

    vi.resetModules();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: (name: string) => {
          const value = cookieStore.get(name);
          return value === undefined ? undefined : { name, value };
        },
        set: (name: string, value: string) => {
          cookieStore.set(name, value);
        },
      }),
    }));
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.resetModules();
    vi.doUnmock("next/headers");
  });

  it("rejects locked deliberate", async () => {
    const { deliberate } = await import("@/app/actions");
    const res = await deliberate("Should we ship?");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("locked");
  });

  it("fails closed when MAGI_ACCESS_CODE unset", async () => {
    delete process.env.MAGI_ACCESS_CODE;
    const { deliberate } = await import("@/app/actions");
    const res = await deliberate("Should we ship?");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not_configured");
  });

  it("unlock + deliberate works in mock mode", async () => {
    const { unlockAccessCode, deliberate, getUiBootstrap } =
      await import("@/app/actions");
    const unlocked = await unlockAccessCode("web-pass");
    expect(unlocked.ok).toBe(true);
    const boot = await getUiBootstrap();
    expect(boot.unlocked).toBe(true);
    expect(boot.mockMode).toBe(true);
    expect(boot.accessConfigured).toBe(true);

    const res = await deliberate("Should we schedule a team lunch?");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mockMode).toBe(true);
      expect(res.verdict).toBe("APPROVE");
      expect(res.results.MELCHIOR.unitStatus).toBe("ok");
    }
  });
});
