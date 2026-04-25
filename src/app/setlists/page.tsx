import type { Metadata } from "next";
import { SetlistManager } from "@/components/SetlistManager";

export const metadata: Metadata = {
  title: "Setlists",
};

export default function SetlistsPage() {
  return <SetlistManager />;
}
