import { describe, expect, it, vi } from "vitest";

import { lookupPublicBoardLicense } from "../pipeline/lib/clinician-license-boards.mjs";

describe("public clinician license board adapters", () => {
  it("returns a unique current Texas physician record with a direct official source", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      license_type: "Physician License",
      first_name: "ADA M",
      last_name: "LOVELACE",
      license_number: "T1234",
      license_expiration_date: "2027-10-31T00:00:00.000",
      registration_status: "ACTIVE",
      disciplinary_status: "NONE",
      practice_city: "AUSTIN",
      practice_state: "TX",
      currently_licensed: "Y",
    }]), { status: 200 }));

    const result = await lookupPublicBoardLicense({
      jurisdictionCode: "TX",
      candidate: { full_name: "Ada Lovelace" },
      location: { locality: "Austin" },
      fetchImpl,
    });

    expect(result).toMatchObject({
      outcome: "verified",
      record: {
        license_number: "T1234",
        licensing_authority: "Texas Medical Board",
        license_expires_at: "2027-10-31",
      },
    });
    expect(result.record.board_source_url).toContain("data.texas.gov/resource/tm3v-pfq9.json");
  });

  it("does not auto-match duplicate names unless locality resolves one", async () => {
    const records = ["Austin", "Dallas"].map((city, index) => ({
      license_type: "Physician License",
      first_name: "ADA",
      last_name: "LOVELACE",
      license_number: `T${index}`,
      license_expiration_date: "2027-10-31T00:00:00.000",
      registration_status: "ACTIVE",
      disciplinary_status: "NONE",
      practice_city: city.toUpperCase(),
      currently_licensed: "Y",
    }));
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify(records), { status: 200 }));
    const ambiguous = await lookupPublicBoardLicense({
      jurisdictionCode: "TX", candidate: { full_name: "Ada Lovelace" }, location: {}, fetchImpl,
    });
    expect(ambiguous.outcome).toBe("ambiguous_board_match");

    const resolved = await lookupPublicBoardLicense({
      jurisdictionCode: "TX", candidate: { full_name: "Ada Lovelace" }, location: { locality: "Dallas" }, fetchImpl,
    });
    expect(resolved.record.license_number).toBe("T1");
  });

  it("accepts only active Washington physician credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      credentialnumber: "MD.MD.12345",
      lastname: "Lovelace",
      firstname: "Ada",
      middlename: "M",
      credentialtype: "Physician And Surgeon License",
      status: "Active",
      expirationdate: "10/31/2027",
      actiontaken: "No",
    }]), { status: 200 }));

    const result = await lookupPublicBoardLicense({
      jurisdictionCode: "WA",
      candidate: { full_name: "Dr. Ada Lovelace, MD" },
      location: { locality: "Seattle" },
      fetchImpl,
    });
    expect(result).toMatchObject({
      outcome: "verified",
      record: { license_number: "MD.MD.12345", license_expires_at: "2027-10-31" },
    });
    expect(result.record.board_source_url).toContain("data.wa.gov/resource/qxh8-f4bd.json");
  });

  it("does not publish public records with action or disciplinary flags", async () => {
    const texas = await lookupPublicBoardLicense({
      jurisdictionCode: "TX",
      candidate: { full_name: "Ada Lovelace", credentials: "MD" },
      location: { locality: "Austin" },
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify([{
        license_type: "Physician License", first_name: "ADA", last_name: "LOVELACE",
        license_number: "T1234", license_expiration_date: "2027-10-31T00:00:00.000",
        registration_status: "ACTIVE", disciplinary_status: "SEE PREVIOUS ORDER",
        degree: "MD", currently_licensed: "Y", practice_city: "AUSTIN",
      }]), { status: 200 })),
    });
    expect(texas.outcome).toBe("board_record_not_found");

    const washington = await lookupPublicBoardLicense({
      jurisdictionCode: "WA",
      candidate: { full_name: "Ada Lovelace", credentials: "MD" },
      location: { locality: "Seattle" },
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify([{
        credentialnumber: "MD.MD.12345", lastname: "Lovelace", firstname: "Ada",
        credentialtype: "Physician And Surgeon License", status: "Active",
        expirationdate: "10/31/2027", actiontaken: "Yes",
      }]), { status: 200 })),
    });
    expect(washington.outcome).toBe("board_record_not_found");
  });

  it("leaves unsupported states unverified", async () => {
    const fetchImpl = vi.fn();
    const result = await lookupPublicBoardLicense({
      jurisdictionCode: "CA", candidate: { full_name: "Ada Lovelace" }, location: {}, fetchImpl,
    });
    expect(result).toEqual({ outcome: "board_source_unsupported", records: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not match a DO candidate to an MD board record", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      license_type: "Physician License",
      first_name: "ADA",
      last_name: "LOVELACE",
      license_number: "T1234",
      license_expiration_date: "2027-10-31T00:00:00.000",
      registration_status: "ACTIVE",
      disciplinary_status: "NONE",
      degree: "MD",
      currently_licensed: "Y",
    }]), { status: 200 }));
    const result = await lookupPublicBoardLicense({
      jurisdictionCode: "TX",
      candidate: { full_name: "Ada Lovelace", credentials: "DO" },
      location: {},
      fetchImpl,
    });
    expect(result.outcome).toBe("board_record_not_found");
  });
});
