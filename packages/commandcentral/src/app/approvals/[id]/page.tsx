import RequestDetailPage from "./client";

export function generateStaticParams() {
  return [{ id: "__" }];
}

export default function Page() {
  return <RequestDetailPage />;
}
