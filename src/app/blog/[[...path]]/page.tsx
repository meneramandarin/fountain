import { permanentRedirect } from "next/navigation";

export default async function LegacyBlogRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  permanentRedirect(`/journal${path.length ? `/${path.join("/")}` : ""}`);
}
