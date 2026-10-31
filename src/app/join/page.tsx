"use client";
import { JoinScreen } from "@/client/join";

/** Invited admins join here (the link in the invite email). The server checks the open invite on every request. */
export default function JoinPage() {
  return <JoinScreen />;
}
