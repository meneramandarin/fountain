export async function handleNoop() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { ok: true };
}
