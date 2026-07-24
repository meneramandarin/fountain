"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LandingFooter() {
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
              <a href="mailto:hello@fountain.clinic">Contact</a>
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
              className="footer-newsletter-form"
              onSubmit={(event) => event.preventDefault()}
            >
              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                aria-label="Email address"
                required
              />
              <button type="submit" className="footer-newsletter-submit" aria-label="Subscribe">
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </div>
      <div className="footer-bottom">© 2026 Fountain. All rights reserved.</div>
    </footer>
  );
}
