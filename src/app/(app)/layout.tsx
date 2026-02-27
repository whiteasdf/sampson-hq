import { TopNav } from "@/components/top-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-[1440px] px-6 py-6">{children}</main>
    </>
  );
}
