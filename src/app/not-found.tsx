import Image from "next/image";
import Link from "next/link";
import { SplitDirectorySearch } from "@/components/split-directory-search";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <Image
        className="not-found-image"
        src="/404.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
      />
      <div className="not-found-scrim" aria-hidden="true" />

      <header className="not-found-header" aria-label="Site header">
        <Link className="landing-brand not-found-brand" href="/">
          fountain
        </Link>
        <SplitDirectorySearch className="not-found-search" compact />
        <button className="coming-soon-pill not-found-join" type="button">
          Coming Soon <span aria-hidden="true">|</span> Join
        </button>
      </header>

      <section className="not-found-copy" aria-label="Page not found">
        <h1>This page doesn&apos;t exist.</h1>
      </section>
    </main>
  );
}
