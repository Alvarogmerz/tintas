import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/guards";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-brand-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-8 shadow-2xl shadow-black/40">
        <Image src="/logo-dark.png" alt="PgO" width={140} height={140} className="mx-auto h-auto w-24" priority />
        <h1 className="mt-5 text-center text-lg font-semibold text-slate-900">Tintas Auto</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Inicia sesión para acceder al panel.</p>
        <LoginForm />
      </div>
    </main>
  );
}
