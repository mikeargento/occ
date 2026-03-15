import AuditEntryPage from "./client";

export function generateStaticParams() {
  return [{ id: "__" }];
}

export default function Page() {
  return <AuditEntryPage />;
}
