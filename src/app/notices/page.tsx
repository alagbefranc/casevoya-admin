import { redirect } from "next/navigation";

export default function NoticesRedirect() {
  redirect("/incidents?tab=notices");
}
