import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./back-pill-link.module.css";

type BackPillLinkProps = {
  children: ReactNode;
  href: string;
  tone?: "dark" | "light";
};

export function BackPillLink({
  children,
  href,
  tone = "light",
}: BackPillLinkProps) {
  return (
    <Link className={`${styles.pill} ${styles[tone]}`} href={href}>
      <ArrowLeft size={16} aria-hidden="true" />
      {children}
    </Link>
  );
}
