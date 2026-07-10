import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactNode } from "react";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import type { LegalDocument } from "@/lib/legal-documents";

const DOCS_ROOT = path.join(process.cwd(), "docs");
const INLINE_TOKEN = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+[^\s).,])/g;

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_TOKEN.lastIndex = 0;

  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <a className="inline" href={token} key={`link-${match.index}`} rel="noopener noreferrer" target="_blank">
          {token}
        </a>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMarkdown(markdown: string) {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map((block, index) => {
      const normalized = block.replace(/\n/g, " ").trim();

      if (!normalized || normalized.startsWith("# ")) {
        return null;
      }

      if (normalized.startsWith("### ")) {
        return <h3 key={index}>{renderInline(normalized.slice(4))}</h3>;
      }

      if (normalized.startsWith("## ")) {
        return <h2 key={index}>{renderInline(normalized.slice(3))}</h2>;
      }

      return <p key={index}>{renderInline(normalized)}</p>;
    });
}

async function loadLegalDocument(document: LegalDocument) {
  return readFile(path.join(DOCS_ROOT, document.source), "utf8");
}

export async function LegalDocumentPage({ document }: { document: LegalDocument }) {
  const markdown = await loadLegalDocument(document);

  return (
    <main className="editorial-page legal-page">
      <LandingScrollHeader alwaysVisible />

      <div className="wrap legal-heading">
        <h1>{document.title}</h1>
      </div>

      <div className="wrap">
        <article>{renderMarkdown(markdown)}</article>
      </div>

      <LandingFooter />
    </main>
  );
}
