"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type NewsletterFormState = "idle" | "submitting" | "success" | "error";

export function LandingFooter() {
  const [newsletterState, setNewsletterState] =
    useState<NewsletterFormState>("idle");
  const [newsletterMessage, setNewsletterMessage] = useState("");

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newsletterState === "submitting" || newsletterState === "success") {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setNewsletterState("submitting");
    setNewsletterMessage("");

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          website: formData.get("website"),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "Please try again.");
      }

      form.reset();
      setNewsletterState("success");
      setNewsletterMessage(result.message || "You’re on the list—thank you!");
    } catch (error) {
      setNewsletterState("error");
      setNewsletterMessage(
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  return (
    <footer className="landing-footer">
      <div className="footer-wordmark">fountain</div>
      <div className="footer-columns">
        <div>
          <h4>For Providers</h4>
          <ul>
            <li>
              <a href="mailto:hello@fountain.clinic">List Your Clinic</a>
            </li>
            <li>
              <a href="mailto:hello@fountain.clinic">Claim Your Listing</a>
            </li>
            <li>
              <a href="mailto:hello@fountain.clinic">Advertise With Us</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li>
              <Link href="/privacy-policy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/terms-of-service">Terms of Service</Link>
            </li>
            <li>
              <a href="/fountain-wordmark.png" target="_blank" rel="noreferrer">Wordmark</a>
            </li>
          </ul>
        </div>
        <div className="footer-newsletter">
          <div className="footer-newsletter-section">
            <p className="footer-newsletter-eyebrow">STAY IN TOUCH</p>
            <div className="footer-social">
              <a href="https://instagram.com/onthepursuitofalongerlife" target="_blank" rel="noreferrer" aria-label="Instagram" className="footer-social-link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a href="https://www.linkedin.com/company/playbyear/" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="footer-social-link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <line x1="7.5" y1="10.5" x2="7.5" y2="16.5" />
                  <circle cx="7.5" cy="7.3" r="0.6" fill="currentColor" stroke="none" />
                  <path d="M11.5 16.5v-6M11.5 13c0-1.4 1-2.5 2.3-2.5s2.2 1 2.2 2.4v3.6" />
                </svg>
              </a>
            </div>
          </div>
          <div className="footer-newsletter-section">
            <h4>Subscribe to newsletter</h4>
            <form
              className={`footer-newsletter-form is-${newsletterState}`}
              onSubmit={handleNewsletterSubmit}
              aria-busy={newsletterState === "submitting"}
              aria-describedby="footer-newsletter-status"
            >
              <div className="footer-newsletter-honeypot" aria-hidden="true">
                <label htmlFor="footer-newsletter-website">Website</label>
                <input
                  id="footer-newsletter-website"
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                aria-label="Email address"
                aria-invalid={newsletterState === "error"}
                onChange={() => {
                  if (newsletterState === "error") {
                    setNewsletterState("idle");
                    setNewsletterMessage("");
                  }
                }}
                disabled={
                  newsletterState === "submitting" ||
                  newsletterState === "success"
                }
                required
              />
              <button
                type="submit"
                className="footer-newsletter-submit"
                aria-label={
                  newsletterState === "submitting" ? "Subscribing" : "Subscribe"
                }
                disabled={
                  newsletterState === "submitting" ||
                  newsletterState === "success"
                }
              >
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </form>
            <p
              id="footer-newsletter-status"
              className={`footer-newsletter-status is-${newsletterState}`}
              role={newsletterState === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {newsletterMessage}
            </p>
          </div>
        </div>
      </div>
      <div className="footer-bottom">© 2026 Fountain. All rights reserved.</div>
    </footer>
  );
}
