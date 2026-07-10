import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { getLegalDocument } from "@/lib/legal-documents";
import { siteName } from "@/lib/site";

const document = getLegalDocument("terms-of-service");

export const metadata: Metadata = {
  title: document?.title,
  description: document?.description,
  alternates: {
    canonical: "/terms-of-service",
  },
  openGraph: {
    type: "website",
    siteName,
    title: document?.title,
    description: document?.description,
    url: "/terms-of-service",
  },
};

export default function TermsOfServicePage() {
  if (!document) {
    throw new Error("Missing terms-of-service legal document");
  }

  return <LegalDocumentPage document={document} />;
}
