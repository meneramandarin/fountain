import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LocationRegulatoryVerification,
  type LocationRegulatoryVerificationData,
} from "../src/components/location-regulatory-verification";

const dha: LocationRegulatoryVerificationData = {
  authority_code: "DHA",
  verification_kind: "facility_license",
  credential_number: "3449309",
  credential_status: "Active registry listing",
  authority_name: "Dubai Health Authority",
  evidence_level: "regulator_registry",
  source_url: "https://services.dha.gov.ae/facility-details?facilityId=3449309",
  verified_at: "2026-08-10T18:00:00-07:00",
};

const mohap: LocationRegulatoryVerificationData = {
  authority_code: "MOHAP",
  verification_kind: "health_advertisement_license",
  credential_number: "T0UOE5NK-020526",
  credential_status: "Displayed on current official website",
  authority_name: "UAE Ministry of Health and Prevention",
  evidence_level: "first_party_disclosure",
  source_url: "https://shookra.com/",
  verified_at: "2026-08-10T18:00:00-07:00",
};

describe("LocationRegulatoryVerification", () => {
  it("keeps a regulator-verified facility licence separate from an advertisement disclosure", () => {
    const markup = renderToStaticMarkup(
      createElement(LocationRegulatoryVerification, { verifications: [dha, mohap] }),
    );

    expect(markup).toContain("DHA Licensed");
    expect(markup).toContain("MOHAP Ad Licence");
    expect(markup).toContain("not a facility licence");
    expect(markup).toContain("3449309");
    expect(markup).toContain("T0UOE5NK-020526");
  });

  it("renders one accessible compact indicator", () => {
    const markup = renderToStaticMarkup(
      createElement(LocationRegulatoryVerification, { verifications: [dha, mohap], compact: true }),
    );

    expect(markup).toContain("DHA facility licence verified");
    expect(markup).toContain("active Dubai Medical Registry");
    expect(markup).not.toContain("MOHAP health-advertisement licence");
    expect(markup.match(/clinician-license-icon/g)).toHaveLength(1);
  });

  it("still renders a compact MOHAP indicator when no DHA licence is available", () => {
    const markup = renderToStaticMarkup(
      createElement(LocationRegulatoryVerification, { verifications: [mohap], compact: true }),
    );

    expect(markup).toContain("MOHAP health-advertisement licence");
    expect(markup.match(/clinician-license-icon/g)).toHaveLength(1);
  });

  it("renders nothing without evidence", () => {
    expect(renderToStaticMarkup(createElement(LocationRegulatoryVerification, { verifications: [] }))).toBe("");
  });
});
