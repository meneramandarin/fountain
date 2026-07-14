"use client";

import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="footer-wordmark">fountain</div>
      <div className="footer-columns">
        <div>
          <h4>Explore Fountain</h4>
          <ul>
            <li>
              <Link href="/directory?kind=locations">Clinics &amp; Med Spas</Link>
            </li>
            <li>
              <Link href="/directory">Treatments</Link>
            </li>
            <li>
              <Link href="/directory">Longevity Domains</Link>
            </li>
          </ul>
        </div>
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
              <a href="/fountain-wordmark.png" target="_blank" rel="noreferrer">Wordmark</a>
            </li>
            <li>
              <a href="mailto:hello@fountain.clinic">Contact</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Resources</h4>
          <ul>
            <li>
              <Link href="/privacy-policy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/terms-of-service">Terms of Service</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">© 2026 Fountain. All rights reserved.</div>
    </footer>
  );
}
