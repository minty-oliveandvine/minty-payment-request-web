"use client";

import { useEffect, useState, type ReactNode } from "react";

import { getAuth, getRoleFromToken } from "@/lib/auth";
import { useEntitlements } from "@/lib/moduleClaims";
import { buildMintyEnterUrl, MINTY_MODULE_URL } from "@/lib/mintyUrls";
import { useUserRole } from "@/lib/useUserRole";

/**
 * "Module not active" — Minty's own refusal page, rendered here.
 *
 * WHY IT HAS TO EXIST ON THIS SIDE. Payment Request is a module an entity subscribes to,
 * and Minty gates it: reach a Petty-Cash-only company's payment pages there and
 * `authz.permission_denied(..., reason=module_inactive)` sends you to
 * `entity_no_permission.html`. This app is that module, reached by a signed handoff, and
 * had no such gate — a user whose company doesn't have Payment Request could still land on
 * a working-looking Payment Request screen. The screens are only as empty as the data
 * makes them, which reads as a broken app rather than a module they haven't bought.
 *
 * It is a deliberate COPY of Minty's page rather than a link to it. The two apps are two
 * origins, and bouncing the browser to Minty to be told "not active" costs a round trip
 * and drops the user somewhere they then have to navigate back from. The copy is
 * faithful — same headline, same explanation, same two actions in the same order — so
 * being refused feels like one product, whichever half of it you were standing in.
 *
 * `variant` mirrors the two branches of that template: a module that isn't switched on
 * (amber, fixable, usually a lapsed subscription) and a permission denial (red, not
 * fixable by the person reading it). They are kept apart for the reason Minty's own
 * comment gives — telling someone they "don't have permission" when the real answer is
 * "nobody has bought this yet" sends them to the wrong person.
 */

const TEAL = "#54D3DA";

function CardIcon({ className }: { className: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}

function LockIcon({ className }: { className: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

export function ModuleNotActive({
  variant = "module",
}: {
  variant?: "module" | "permission";
}) {
  const inactive = variant === "module";
  const title = inactive ? "Module not active" : "Access Denied";

  // Cookies are client-only; read after mount like every other page here, so the server
  // and first client render agree.
  const [entityId, setEntityId] = useState<string>("");
  useEffect(() => setEntityId(getAuth()?.entityId ?? ""), []);

  // Minty offers the subscription link only when the reader could actually open it —
  // `MODULE_VIEW` starts at CASHIER, so any member qualifies, and an unqualified link
  // would bounce them straight back to this same refusal. Same rule here.
  const { hasAnyRole } = useUserRole();
  const canCheckSubscription = inactive && Boolean(entityId) && hasAnyRole;

  const entityListUrl = `${MINTY_MODULE_URL}/entity`;
  // Through `/enter` so the billing token buys a Flask session on arrival. A bare path
  // would land them on Minty's login form, which is a worse dead end than this page.
  const subscriptionUrl = entityId
    ? buildMintyEnterUrl(`/entity/${encodeURIComponent(entityId)}/settings/modules`)
    : entityListUrl;

  return (
    <div className="flex min-h-dvh min-h-screen flex-col bg-gray-50">
      <div className="relative flex flex-shrink-0 items-center justify-center px-4 py-3">
        <h1 className="text-lg font-semibold text-[#474747]">{title}</h1>
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="flex flex-col items-center gap-8 p-5">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full shadow-inner ${
              inactive
                ? "bg-amber-100 text-amber-600"
                : "bg-red-100 text-red-600"
            }`}
          >
            {inactive ? (
              <CardIcon className="h-10 w-10" />
            ) : (
              <LockIcon className="h-10 w-10" />
            )}
          </div>

          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>

          <p className="max-w-sm text-center text-gray-600">
            {inactive ? (
              <>
                This module isn&apos;t active for this entity. That usually means it was
                switched off, or its subscription has lapsed.
                {!canCheckSubscription
                  ? " Ask an admin for this entity to check its subscription settings."
                  : ""}
              </>
            ) : (
              <>
                You don&apos;t have permission to view this page. Please contact your
                administrator or go back to the entity list.
              </>
            )}
          </p>
        </div>

        <div className="mt-6 flex w-full max-w-md flex-col gap-3">
          {canCheckSubscription ? (
            <>
              <a
                href={subscriptionUrl}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium text-white shadow-md transition-opacity hover:opacity-90"
                style={{ backgroundColor: TEAL }}
              >
                <CardIcon className="h-5 w-5" />
                <span>Check subscription settings</span>
              </a>
              <a
                href={entityListUrl}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-3 font-medium text-[#474747] transition-colors hover:bg-gray-100"
              >
                <ArrowLeftIcon />
                <span>Back to Entity List</span>
              </a>
            </>
          ) : (
            <a
              href={entityListUrl}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium text-white shadow-md transition-opacity hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              <ArrowLeftIcon />
              <span>Back to Entity List</span>
            </a>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Wrap a Payment Request screen so it renders only for an entity that has the module.
 *
 * `useEntitlements` is what decides, and its two-stage answer is the reason there is no
 * flash of the wrong thing in either direction: the JWT's `billing_enabled` claim is read
 * synchronously for the first paint, then `/auth/entitlements` confirms it from the
 * database. A company that genuinely lacks the module carries `false` in the token, so the
 * refusal is what paints first; a company that has it never sees the refusal at all,
 * because the claim defaults to TRUE when missing or unreadable.
 *
 * That default is deliberate and worth keeping: a stale or claim-less token must not lock
 * a paying customer out of a module they own. This gate is a signpost for the ordinary
 * case, not the security boundary — the boundary is the backend, which checks entity
 * membership and entitlements on every call regardless of what this decides.
 */
export function ModuleGate({ children }: { children: ReactNode }) {
  const { billingEnabled } = useEntitlements();

  // WHICH refusal, and it is not the same question as whether to refuse. A member of a
  // company that never bought Payment Request needs "Module not active" and a link to fix
  // it; somebody with no role on the company at all needs "Access Denied", because the
  // subscription page would refuse them too and sending them there is a dead end.
  //
  // The role claim answers it: Minty stamps "" for a user with no `user_entity` row (see
  // `_resolve_user_entity_role`). Read after mount rather than during render — it comes
  // from a cookie, and reading cookies while rendering makes the server and client
  // disagree.
  //
  // `resolved` exists because "not read yet" and "no role" are otherwise the same value,
  // and guessing between them for one frame shows the wrong refusal to the wrong person.
  const [access, setAccess] = useState<{ resolved: boolean; member: boolean }>({
    resolved: false,
    member: false,
  });
  useEffect(() => {
    setAccess({ resolved: true, member: Boolean((getRoleFromToken() ?? "").trim()) });
  }, []);

  if (billingEnabled) return <>{children}</>;
  if (!access.resolved) return null;
  return <ModuleNotActive variant={access.member ? "module" : "permission"} />;
}
