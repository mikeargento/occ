import { redirect } from "next/navigation";

export const metadata = {
  title: "Integrations | OCC",
  description: "OCC works with every AI framework. One proof format, cryptographic receipts for every tool call.",
};

export default function IntegrationsPage() {
  redirect("/");
}
