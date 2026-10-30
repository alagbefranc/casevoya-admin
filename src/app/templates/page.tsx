import { redirect } from "next/navigation";

export default function TemplatesRedirect() {
  redirect("/releases?tab=templates");
}
