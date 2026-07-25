const NEWSLETTER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeNewsletterEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > 254 ||
    !NEWSLETTER_EMAIL_PATTERN.test(email)
  ) {
    return null;
  }

  return email;
}
