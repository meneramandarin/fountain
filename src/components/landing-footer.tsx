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
              <Link href="/directory?kind=practitioners">Practitioners</Link>
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
              <a href="#">List Your Clinic</a>
            </li>
            <li>
              <a href="#">Claim Your Listing</a>
            </li>
            <li>
              <a href="#">Advertise With Us</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li>
              <a href="#">About Fountain</a>
            </li>
            <li>
              <a href="#">Careers</a>
            </li>
            <li>
              <a href="#">Press</a>
            </li>
            <li>
              <a href="#">Contact</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Resources</h4>
          <ul>
            <li>
              <a href="#">Help Center</a>
            </li>
            <li>
              <a href="#">Privacy Policy</a>
            </li>
            <li>
              <a href="#">Terms of Service</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">© 2026 Fountain. All rights reserved.</div>
    </footer>
  );
}
