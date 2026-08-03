import { describe, expect, it, vi } from "vitest";

import {
  CLINICIAN_LICENSE_PROMPT_VERSION,
  CLINICIAN_LICENSE_MODEL,
  extractClinicianPageUrls,
  extractCliniciansWithLlm,
  extractDeterministicClinicianCandidates,
  handleClinicianLicenseVerify,
  normalizeClinicianCandidates,
  normalizeUsState,
} from "../pipeline/tasks/clinician_license_verify.mjs";

const location = {
  id: 42,
  name: "Example Clinic",
  website: "https://clinic.example/",
  address: "100 Main Street",
  locality: "Austin",
  region: "Texas",
  postal_code: "78701",
  country_code: "US",
  status: "active",
  deleted_at: null,
  organization_name: "Example Health",
  organization_location_count: 1,
  has_current_verification: false,
  non_suppressed: true,
};

const page = {
  ok: true,
  requested_url: "https://clinic.example/team",
  final_url: "https://clinic.example/team",
  title: "Our team",
  html: "",
  content: "Dr. Ada Lovelace, MD, is our medical director and treats patients at Example Clinic.",
};

describe("clinician license verification discovery", () => {
  it("normalizes U.S. state names and codes", () => {
    expect(normalizeUsState("California")).toBe("CA");
    expect(normalizeUsState(" dc ")).toBe("DC");
    expect(normalizeUsState("New York")).toBe("NY");
    expect(normalizeUsState("Ontario")).toBeNull();
  });

  it("ranks only same-origin clinician pages", () => {
    const urls = extractClinicianPageUrls(`
      <a href="/blog">Blog</a>
      <a href="/about">About us</a>
      <a href="/providers">Meet our providers</a>
      <a href="https://other.example/team">Other team</a>
    `, "https://clinic.example/", { limit: 3 });

    expect(urls[0]).toBe("https://clinic.example/providers");
    expect(urls).toContain("https://clinic.example/about");
    expect(urls).not.toContain("https://other.example/team");
  });

  it("accepts only an evidence-backed MD or DO from a crawled source", () => {
    const normalized = normalizeClinicianCandidates({
      clinicians: [
        {
          full_name: "Ada Lovelace",
          credentials: "MD",
          role: "Medical Director",
          source_url: page.final_url,
          evidence_text: page.content,
          location_connection: "Treats patients at Example Clinic",
          confidence: 0.98,
        },
        {
          full_name: "Grace Hopper",
          credentials: "NP",
          role: "Nurse Practitioner",
          source_url: page.final_url,
          evidence_text: "Grace Hopper is a nurse practitioner.",
          location_connection: "Team member",
          confidence: 0.99,
        },
      ],
    }, [page], location);

    expect(normalized.accepted).toHaveLength(1);
    expect(normalized.accepted[0]).toMatchObject({ full_name: "Ada Lovelace", credentials: "MD" });
    expect(normalized.rejected).toEqual([{ full_name: "Grace Hopper", reason: "not_md_or_do" }]);
  });

  it("rejects invented evidence and unlocalized chain clinicians", () => {
    const baseCandidate = {
      full_name: "Ada Lovelace",
      credentials: "MD",
      role: "Medical Director",
      source_url: page.final_url,
      location_connection: "National medical director",
      confidence: 0.99,
    };
    expect(normalizeClinicianCandidates({
      clinicians: [{ ...baseCandidate, evidence_text: "Ada Lovelace, MD, works here." }],
    }, [page], location).rejected[0].reason).toBe("evidence_not_verbatim");

    expect(normalizeClinicianCandidates({
      clinicians: [{ ...baseCandidate, evidence_text: page.content }],
    }, [page], { ...location, organization_location_count: 8, locality: "Dallas", postal_code: "75201" })
      .rejected[0].reason).toBe("chain_location_not_supported");
  });

  it("requires the cited excerpt itself to show both a physician credential and clinic role", () => {
    const biographyOnly = "Ada Lovelace received her doctorate and completed residency at Example Hospital.";
    const credentialOnly = "Ada Lovelace, MD, completed residency at Example Hospital.";
    const biographyPage = { ...page, content: `${biographyOnly}\n${credentialOnly}` };
    const base = {
      full_name: "Ada Lovelace",
      credentials: "MD",
      role: "Medical Director",
      source_url: page.final_url,
      location_connection: "Example Clinic",
      confidence: 1,
    };

    expect(normalizeClinicianCandidates({
      clinicians: [{ ...base, evidence_text: biographyOnly }],
    }, [biographyPage], location).rejected[0].reason).toBe("credential_not_in_evidence");
    expect(normalizeClinicianCandidates({
      clinicians: [{ ...base, evidence_text: credentialOnly }],
    }, [biographyPage], location).rejected[0].reason).toBe("affiliation_not_in_evidence");
  });

  it("extracts explicit physician credentials without an LLM and rejects honorific-only names", () => {
    expect(extractDeterministicClinicianCandidates([page], location)).toEqual([
      expect.objectContaining({ full_name: "Ada Lovelace", credentials: "MD", confidence: 1 }),
    ]);

    const weakName = normalizeClinicianCandidates({
      clinicians: [{
        full_name: "Dr. Fruitman",
        credentials: "M.D.",
        role: "Physician",
        source_url: page.final_url,
        evidence_text: "Dr. Fruitman, M.D.",
        location_connection: "Example Clinic",
        confidence: 1,
      }],
    }, [{ ...page, content: "Dr. Fruitman, M.D." }], location);
    expect(weakName.rejected).toEqual([{ full_name: "Dr. Fruitman", reason: "invalid_name" }]);
  });

  it("does not interpret prose before Maryland's abbreviation as a physician name", () => {
    const maryland = {
      ...page,
      content: "Dr. Leigh Vinocur leads clinics in Owings Mills and Frederick, MD, with an experienced team.",
    };
    expect(extractDeterministicClinicianCandidates([maryland], location)).toEqual([]);
  });

  it("requires chain evidence itself—not a model-supplied connection—to name the branch", () => {
    const chainPage = {
      ...page,
      final_url: "https://clinic.example/medical-team",
      requested_url: "https://clinic.example/medical-team",
      content: "Ada Lovelace, MD is the national medical director.",
    };
    const normalized = normalizeClinicianCandidates({
      clinicians: [{
        full_name: "Ada Lovelace",
        credentials: "MD",
        role: "Medical Director",
        source_url: chainPage.final_url,
        evidence_text: chainPage.content,
        location_connection: "Example Clinic Austin",
        confidence: 1,
      }],
    }, [chainPage], { ...location, organization_location_count: 12 });
    expect(normalized.rejected).toEqual([{ full_name: "Ada Lovelace", reason: "chain_location_not_supported" }]);
  });

  it("excludes article, family, and historical-referral mentions", () => {
    for (const content of [
      "Sarah V. Kelly, MD, authored this case study with our physician team.",
      "They are the proud parents of Samuel Lee Chong, DO, an emergency physician.",
      "Patients from orthopedic surgeon Gregory Harvey, MD were treated here from 2015 to 2017.",
    ]) {
      expect(extractDeterministicClinicianCandidates([{ ...page, content }], location)).toEqual([]);
    }
  });

  it("rejects an organization phrase formatted with M.D. as a person name", () => {
    const content = "At Forest Wellness, M.D., our physician team provides tailored care.";
    expect(extractDeterministicClinicianCandidates([{ ...page, content }], location)).toEqual([]);
  });

  it("uses the cheap configured model and strict JSON extraction", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({ clinicians: [], no_clinician_reason: "No named physician" }),
      model: CLINICIAN_LICENSE_MODEL,
      externalCallId: 17,
      costEstimateUsd: 0.0004,
    });

    const result = await extractCliniciansWithLlm({
      location,
      pages: [page],
      runId: 9,
      llmClient: { complete },
    });

    expect(result).toMatchObject({ external_call_id: 17, cost_estimate_usd: 0.0004 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      model: CLINICIAN_LICENSE_MODEL,
      responseFormat: expect.objectContaining({ type: "json_schema" }),
    }));
    const request = complete.mock.calls[0][0];
    expect(JSON.parse(request.messages[1].content).prompt_version).toBe(CLINICIAN_LICENSE_PROMPT_VERSION);
  });

  it("accepts fenced JSON from a free routed model", async () => {
    const result = await extractCliniciansWithLlm({
      location,
      pages: [page],
      runId: 9,
      llmClient: {
        complete: vi.fn().mockResolvedValue({
          content: "```json\n{\"clinicians\":[],\"no_clinician_reason\":\"No physician\"}\n```",
          model: "openrouter/free",
          externalCallId: 19,
          costEstimateUsd: 0,
        }),
      },
    });

    expect(result.parsed).toEqual({ clinicians: [], no_clinician_reason: "No physician" });
  });

  it("persists discovered candidates through the queue handler", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const result = await handleClinicianLicenseVerify(
      { task: { id: 4, entity_id: 42, entity_type: "location", payload: {} }, run: { id: 9 } },
      {
        query: vi.fn().mockResolvedValue({ rows: [location] }),
        webClient: {},
        crawl: vi.fn().mockResolvedValue({ pages: [page], attempted_urls: [page.final_url] }),
        extract: vi.fn().mockResolvedValue({
          parsed: {
            clinicians: [{
              full_name: "Ada Lovelace",
              credentials: "MD",
              role: "Medical Director",
              source_url: page.final_url,
              evidence_text: page.content,
              location_connection: "Treats patients at Example Clinic",
              confidence: 0.98,
            }],
            no_clinician_reason: null,
          },
          model: CLINICIAN_LICENSE_MODEL,
          external_call_id: 18,
          cost_estimate_usd: 0.0005,
        }),
        persist,
      },
    );

    expect(result).toMatchObject({ outcome: "candidates_found", jurisdiction_code: "TX" });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "candidates_found",
      jurisdictionCode: "TX",
      candidates: [expect.objectContaining({ full_name: "Ada Lovelace" })],
    }));
  });

  it("records ambiguous evidence for review when the optional model is deferred", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const extract = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const ambiguousPage = { ...page, content: "Our physician biography lists the credential MD without a full name." };
    const result = await handleClinicianLicenseVerify(
      { task: { id: 5, entity_id: 42, entity_type: "location", payload: {} }, run: { id: 10 } },
      {
        query: vi.fn().mockResolvedValue({ rows: [location] }),
        webClient: {},
        crawl: vi.fn().mockResolvedValue({ pages: [ambiguousPage], attempted_urls: [page.final_url] }),
        extract,
        persist,
      },
    );

    expect(result).toMatchObject({ outcome: "needs_review", reason: "ambiguous_physician_evidence_model_deferred" });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ outcome: "needs_review", candidates: [] }));
    expect(extract).not.toHaveBeenCalled();
  });
});
