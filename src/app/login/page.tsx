import { loginAction } from "@/app/login/actions";
import {
  getAdminPasswordGateWarning,
  isAdminPasswordGateEnabled,
} from "@/lib/security/internalAccess";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/crm";
  if (raw.startsWith("/login") || raw.startsWith("/logout")) return "/crm";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const query = await searchParams;
  const next = safeNextPath(query?.next);
  const error = Array.isArray(query?.error) ? query?.error[0] : query?.error;
  const warning = getAdminPasswordGateWarning();
  const gateEnabled = isAdminPasswordGateEnabled();

  return (
    <main className="min-h-screen bg-[#f5f6f8] px-5 py-10 text-[#111827]">
      <section className="mx-auto grid min-h-[calc(100vh-80px)] max-w-5xl place-items-center">
        <div className="w-full max-w-xl overflow-hidden rounded-[32px] border border-[#dfe4ea] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
          <div className="bg-[#111827] px-8 py-6 text-white">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9ca3af]">
              Growth OS CRM
            </p>
            <h1 className="mt-3 text-3xl font-black">Admin access</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#d1d5db]">
              Unlock the WhatsApp-first CRM workspace for internal CS operations.
            </p>
          </div>

          <div className="p-8">
            {warning ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
                {warning}
              </p>
            ) : null}

            {error ? (
              <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error === "invalid_password"
                  ? "Password is incorrect. Please try again."
                  : "Admin password gate could not be unlocked."}
              </p>
            ) : null}

            <form action={loginAction} className="mt-6 grid gap-4">
              <input type="hidden" name="next" value={next} />
              {gateEnabled ? (
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748b]">
                    Admin password
                  </span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="mt-2 w-full rounded-xl border border-[#dfe4ea] bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#111827] outline-none transition focus:border-[#111827] focus:bg-white"
                  />
                </label>
              ) : null}
              <button
                type="submit"
                className="rounded-xl bg-[#111827] px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#1f2937]"
              >
                {gateEnabled ? "Unlock CRM" : "Continue to CRM"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
