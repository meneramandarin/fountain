import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { getLegalDocument } from "@/lib/legal-documents";
import { siteName } from "@/lib/site";

const document = getLegalDocument("privacy-policy");

export const metadata: Metadata = {
  title: document?.title,
  description: document?.description,
  alternates: {
    canonical: "/privacy-policy",
  },
  openGraph: {
    type: "website",
    siteName,
    title: document?.title,
    description: document?.description,
    url: "/privacy-policy",
  },
};

export default function PrivacyPolicyPage() {
  if (!document) {
    throw new Error("Missing privacy-policy legal document");
  }

  return <LegalDocumentPage document={document} />;
}
