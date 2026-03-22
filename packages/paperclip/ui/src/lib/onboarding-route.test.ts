import { describe, expect, it } from "vitest";
import {
  isOnboardingPath,
  resolveRouteOnboardingOptions,
  shouldRedirectCompanylessRouteToOnboarding,
} from "./onboarding-route";

describe("isOnboardingPath", () => {
  it("matches the global onboarding route", () => {
    expect(isOnboardingPath("/onboarding")).toBe(true);
  });

  it("matches a company-prefixed onboarding route", () => {
    expect(isOnboardingPath("/pap/onboarding")).toBe(true);
  });

  it("ignores non-onboarding routes", () => {
    expect(isOnboardingPath("/pap/dashboard")).toBe(false);
  });
});

describe("resolveRouteOnboardingOptions", () => {
  it("returns empty options for the global onboarding route", () => {
    expect(
      resolveRouteOnboardingOptions({
        pathname: "/onboarding",
        companies: [],
      }),
    ).toEqual({});
  });

  it("returns companyId when the prefixed company exists", () => {
    expect(
      resolveRouteOnboardingOptions({
        pathname: "/pap/onboarding",
        companyPrefix: "pap",
        companies: [{ id: "company-1", issuePrefix: "PAP" }],
      }),
    ).toEqual({ companyId: "company-1" });
  });

  it("falls back to empty options when the prefixed company is missing", () => {
    expect(
      resolveRouteOnboardingOptions({
        pathname: "/pap/onboarding",
        companyPrefix: "pap",
        companies: [],
      }),
    ).toEqual({});
  });
});

describe("shouldRedirectCompanylessRouteToOnboarding", () => {
  it("redirects companyless entry routes into onboarding", () => {
    expect(
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: "/",
        hasCompanies: false,
      }),
    ).toBe(true);
  });

  it("does not redirect when already on onboarding", () => {
    expect(
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: "/onboarding",
        hasCompanies: false,
      }),
    ).toBe(false);
  });

  it("does not redirect when companies exist", () => {
    expect(
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: "/issues",
        hasCompanies: true,
      }),
    ).toBe(false);
  });
});
