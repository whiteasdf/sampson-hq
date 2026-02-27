import { WorkerNav } from "@/components/worker-nav";

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkerNav />
      <main className="mx-auto max-w-2xl px-6 py-6">{children}</main>
    </>
  );
}
