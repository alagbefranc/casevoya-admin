import { redirect } from "next/navigation";

export default async function TemplateRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/releases/templates/${encodeURIComponent(id)}`);
}
