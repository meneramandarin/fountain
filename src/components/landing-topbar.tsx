import Link from "next/link";

export function LandingTopbar({ className = "" }: { className?: string }) {
  return (
    <div className={`landing-hero-topbar ${className}`.trim()}>
      <Link className="landing-brand landing-hero-brand" href="/" prefetch={false}>
        fountain
      </Link>
      <button className="coming-soon-pill" type="button">
        Coming Soon <span aria-hidden="true">|</span> Join
      </button>
    </div>
  );
}
