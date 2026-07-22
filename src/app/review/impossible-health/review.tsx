"use client";

/* eslint-disable @next/next/no-img-element -- review images come from arbitrary provider domains */

import { useEffect, useMemo, useState } from "react";
import styles from "./review.module.css";

type ReviewDecision = "approved" | "rejected";
type Deck = "pending" | ReviewDecision;

// Kept for the existing full listing-preview route, which still reads the
// original immutable scrape artifact.
export type Provider = {
  source: {
    source_url: string;
    city: string;
    city_slug: string;
    provider_slug: string;
    country_code: string;
    name: string;
    address: string;
    phone: string;
    website: string;
    services: string[];
  };
  google: null | {
    place_id: string;
    name: string;
    address: string;
    phone: string;
    website: string;
  };
};

export type ImpossibleHealthReport = { providers: Provider[] };

export type ReviewCandidate = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  sourceUrl: string | null;
  slug: string;
  locality: string | null;
  region: string | null;
  countryCode: string | null;
  dedupDisposition: string;
  reasons: string[];
  offerings: Array<{
    name: string;
    priceAmount: number | null;
    priceCurrency: string | null;
    sourceUrl: string | null;
  }>;
  images: Array<{ url: string; sourceUrl: string | null; alt: string | null; kind: string | null }>;
  reviewDecision: ReviewDecision | null;
  decisionSource: "auto_price_only" | "manual" | null;
  reviewedAt: string | null;
  reviewerComment: string;
};

export function ImpossibleHealthReview({
  initialCandidates,
  autoApprovedCount,
}: {
  initialCandidates: ReviewCandidate[];
  autoApprovedCount: number;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [deck, setDeck] = useState<Deck>("pending");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ id: number; previous: ReviewDecision | null } | null>(null);
  const [comments, setComments] = useState<Record<number, string>>(() => Object.fromEntries(
    initialCandidates.map((candidate) => [candidate.id, candidate.reviewerComment]),
  ));
  const [savedCommentId, setSavedCommentId] = useState<number | null>(null);

  const manualCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.decisionSource !== "auto_price_only"),
    [candidates],
  );
  const deckCandidates = useMemo(
    () => manualCandidates.filter((candidate) => deck === "pending" ? !candidate.reviewDecision : candidate.reviewDecision === deck),
    [deck, manualCandidates],
  );
  const activeIndex = deckCandidates.length ? Math.min(cursor, deckCandidates.length - 1) : 0;
  const candidate = deckCandidates[activeIndex] || null;
  const pendingCount = manualCandidates.filter((item) => !item.reviewDecision).length;
  const approvedCount = manualCandidates.filter((item) => item.reviewDecision === "approved").length;
  const rejectedCount = manualCandidates.filter((item) => item.reviewDecision === "rejected").length;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (busy || !candidate || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, a, button")) return;
      if (event.key === "ArrowLeft") void decide(candidate.id, "rejected");
      if (event.key === "ArrowRight") void decide(candidate.id, "approved");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function decide(id: number, decision: ReviewDecision) {
    const current = candidates.find((item) => item.id === id);
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/review/impossible-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: id, decision, comment: comments[id] || "" }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not save decision");
      setCandidates((items) => items.map((item) => item.id === id
        ? { ...item, reviewDecision: decision, decisionSource: "manual", reviewedAt: new Date().toISOString(), reviewerComment: comments[id] || "" }
        : item));
      setLastAction({ id, previous: current.reviewDecision });
      if (deck !== "pending") setCursor((value) => Math.max(0, value - 1));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save decision");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!lastAction || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/review/impossible-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: lastAction.id, decision: lastAction.previous }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not undo decision");
      setCandidates((items) => items.map((item) => item.id === lastAction.id
        ? { ...item, reviewDecision: lastAction.previous, decisionSource: lastAction.previous ? "manual" : null, reviewedAt: null }
        : item));
      setLastAction(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not undo decision");
    } finally {
      setBusy(false);
    }
  }

  async function saveComment(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const comment = comments[id] || "";
      const response = await fetch("/api/review/impossible-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: id, comment }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not save note");
      setCandidates((items) => items.map((item) => item.id === id ? { ...item, reviewerComment: comment } : item));
      setSavedCommentId(id);
      window.setTimeout(() => setSavedCommentId((current) => current === id ? null : current), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save note");
    } finally {
      setBusy(false);
    }
  }

  function selectDeck(nextDeck: Deck) {
    setDeck(nextDeck);
    setCursor(0);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Impossible Health · isolated local review</p>
          <h1>Yay or nay?</h1>
        </div>
        <p className={styles.autoApproved}><strong>{autoApprovedCount}</strong> price-only listings auto-approved</p>
      </header>

      <nav className={styles.deckTabs} aria-label="Review status">
        <DeckButton active={deck === "pending"} onClick={() => selectDeck("pending")} label="To review" count={pendingCount} />
        <DeckButton active={deck === "approved"} onClick={() => selectDeck("approved")} label="Yay" count={approvedCount} />
        <DeckButton active={deck === "rejected"} onClick={() => selectDeck("rejected")} label="Nay" count={rejectedCount} />
      </nav>

      <section className={styles.deck} aria-live="polite">
        {candidate ? (
          <>
            <div className={styles.progressRow}>
              <button type="button" onClick={() => setCursor((value) => Math.max(0, value - 1))} disabled={activeIndex === 0}>← Prev</button>
              <span>{activeIndex + 1} / {deckCandidates.length}</span>
              <button type="button" onClick={() => setCursor((value) => Math.min(deckCandidates.length - 1, value + 1))} disabled={activeIndex === deckCandidates.length - 1}>Next →</button>
            </div>
            <CandidateCard
              candidate={candidate}
              comment={comments[candidate.id] || ""}
              commentSaved={savedCommentId === candidate.id}
              busy={busy}
              onCommentChange={(value) => setComments((current) => ({ ...current, [candidate.id]: value }))}
              onSaveComment={() => void saveComment(candidate.id)}
            />
            <div className={styles.actions}>
              <button className={styles.nay} disabled={busy} onClick={() => void decide(candidate.id, "rejected")}>
                <span>×</span> Nay <small>←</small>
              </button>
              <button className={styles.yay} disabled={busy} onClick={() => void decide(candidate.id, "approved")}>
                <span>♥</span> Yay <small>→</small>
              </button>
            </div>
          </>
        ) : (
          <div className={styles.done}>
            <span>✓</span>
            <h2>{deck === "pending" ? "Deck cleared" : `No ${deck} listings yet`}</h2>
            <p>{deck === "pending" ? "Every remaining listing has a saved decision." : "Make a few calls and they’ll show up here."}</p>
          </div>
        )}
        <div className={styles.feedbackRow}>
          {error ? <p className={styles.error}>{error}</p> : <p>Arrow keys work too. Every choice saves immediately.</p>}
          <button type="button" onClick={() => void undo()} disabled={!lastAction || busy}>Undo last</button>
        </div>
      </section>
    </main>
  );
}

function DeckButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return <button type="button" className={active ? styles.deckTabActive : styles.deckTab} onClick={onClick}>{label}<span>{count}</span></button>;
}

function CandidateCard({
  candidate,
  comment,
  commentSaved,
  busy,
  onCommentChange,
  onSaveComment,
}: {
  candidate: ReviewCandidate;
  comment: string;
  commentSaved: boolean;
  busy: boolean;
  onCommentChange: (value: string) => void;
  onSaveComment: () => void;
}) {
  const image = candidate.images[0];
  const place = [candidate.locality, candidate.region, candidate.countryCode].filter(Boolean).join(", ");
  const previewHref = `/review/impossible-health/${sourcePart(candidate.sourceUrl, 0)}/${sourcePart(candidate.sourceUrl, 1)}`;
  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        {image ? <img src={image.url} alt={image.alt || candidate.name} /> : <div className={styles.imageFallback}>No usable image</div>}
        <div className={styles.imageShade} />
        <div className={styles.titleBlock}>
          <p>{place || "Location not verified"}</p>
          <h2>{candidate.name}</h2>
        </div>
        <span className={styles.candidateId}>#{candidate.id}</span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.reasons}>
          {candidate.reasons.map((reason) => <span key={reason}>{reasonLabel(reason)}</span>)}
        </div>

        <dl className={styles.contactGrid}>
          <Fact label="Address" value={candidate.address} />
          <Fact label="Phone" value={candidate.phone} href={candidate.phone ? `tel:${candidate.phone}` : undefined} />
          <Fact label="Email" value={candidate.email || "Not available (optional)"} href={candidate.email ? `mailto:${candidate.email}` : undefined} muted={!candidate.email} />
          <Fact label="Website" value={candidate.website} href={candidate.website || undefined} />
        </dl>

        <section className={styles.offerings}>
          <div className={styles.sectionHeading}>
            <h3>Offerings</h3>
            <span>{candidate.offerings.length}</span>
          </div>
          {candidate.offerings.length ? (
            <ul>
              {candidate.offerings.map((offering, index) => (
                <li key={`${offering.name}-${index}`}>
                  <span>{offering.name}</span>
                  {offering.priceAmount == null
                    ? <em>No verified price</em>
                    : <strong>{formatMoney(offering.priceAmount, offering.priceCurrency)}</strong>}
                </li>
              ))}
            </ul>
          ) : <p className={styles.missing}>No validated offerings found.</p>}
        </section>

        <div className={styles.audit}>
          <span>Dedup: <strong>{dedupLabel(candidate.dedupDisposition)}</strong></span>
          <span>Images: <strong>{candidate.images.length}</strong></span>
        </div>

        <div className={styles.links}>
          {candidate.sourceUrl && <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Impossible Health ↗</a>}
          {candidate.website && <a href={candidate.website} target="_blank" rel="noreferrer">Provider website ↗</a>}
          {candidate.sourceUrl && <a href={previewHref}>Fountain preview →</a>}
        </div>

        <div className={styles.commentBox}>
          <label htmlFor={`review-comment-${candidate.id}`}>Reviewer note</label>
          <textarea
            id={`review-comment-${candidate.id}`}
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSaveComment();
            }}
            placeholder="e.g. Found the phone number on their contact page…"
            rows={3}
          />
          <div>
            <span>{commentSaved ? "Saved ✓" : "⌘ Enter to save"}</span>
            <button type="button" disabled={busy || comment === candidate.reviewerComment} onClick={onSaveComment}>Save note</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Fact({ label, value, href, muted = false }: { label: string; value: string | null; href?: string; muted?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={!value || muted ? styles.muted : undefined}>
        {value ? (href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>{value}</a> : value) : "Missing"}
      </dd>
    </div>
  );
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    duplicate_or_review: "Possible duplicate",
    missing_address: "Address missing",
    missing_phone: "Phone missing",
    missing_website: "Website missing",
    missing_offerings: "Offerings missing",
    missing_prices: "Prices missing",
    missing_image: "Image missing",
    menu_off_target: "Menu needs correction",
  };
  return labels[reason] || reason.replaceAll("_", " ");
}

function dedupLabel(value: string) {
  return value === "new" ? "No existing match" : value.replaceAll("_", " ");
}

function formatMoney(amount: number, currency: string | null) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${currency || "$"} ${amount}`;
  }
}

function sourcePart(sourceUrl: string | null, index: number) {
  if (!sourceUrl) return "";
  try {
    const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
    return encodeURIComponent(parts[index] || "");
  } catch {
    return "";
  }
}
