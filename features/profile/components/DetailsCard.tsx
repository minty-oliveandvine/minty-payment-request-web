// COPY of minty-web/features/profile/components/DetailsCard.tsx (2026-09-30) - lifted into
// @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port).

/**
 * The details card (Figma 10-A): first and last name, the email, the password - each on its
 * teal tile - with "Edit" in the corner. Editing happens in the card: the names and the email
 * become fields, "Edit" becomes "Cancel", and Save sits under them; a refusal is shown in the
 * card, in Flask's words. PASSWORD's "Change" leaves for the Xero account page.
 */

import Image from "next/image";
import type { ReactNode } from "react";

import type { ProfileUser } from "@/features/profile/api/profile";
import type { Draft } from "@/features/profile/hooks/useProfile";
import {
  CANCEL,
  CHANGE,
  CHANGE_PASSWORD_URL,
  EDIT,
  FIRST_NAME,
  LAST_NAME,
  PASSWORD,
  SAVE,
} from "@/features/profile/lib/profileView";
import { EMAIL_ASCII_HINT, useEmailInput } from "@minty/shared/emailInput";

const LABEL = "text-[10px] leading-5 text-[#4b5563]";
const VALUE = "text-sm leading-5 text-[#6b7280]";
const FIELD =
  "mt-0.5 w-full rounded-md border border-[#d9dde3] bg-white px-2 py-1 text-sm leading-5 text-[#374151] focus:border-[#54d3da] focus:outline-none focus:ring-1 focus:ring-[#54d3da]";

function Tile({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[rgba(84,211,218,0.1)]" aria-hidden>
      <Image src={src} alt="" width={width} height={height} unoptimized />
    </span>
  );
}

function Row({ tile, children }: { tile: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-[18px]">
      {tile}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export type DetailsCardProps = {
  user: ProfileUser;
  draft: Draft | null;
  saving: boolean;
  error: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (field: keyof Draft, value: string) => void;
  onSave: () => void;
};

export function DetailsCard({ user, draft, saving, error, onEdit, onCancel, onChange, onSave }: DetailsCardProps) {
  const editing = draft !== null;
  const emailInput = useEmailInput((value) => onChange("email", value));
  return (
    <section className="relative mt-8 rounded-xl bg-white px-[19px] pb-[15px] pt-[35px]" aria-label="Your details">
      <button
        type="button"
        onClick={editing ? onCancel : onEdit}
        disabled={saving}
        className="absolute right-3 top-1 cursor-pointer text-[10px] leading-5 text-[#54d3da] hover:underline disabled:cursor-default"
      >
        {editing ? CANCEL : EDIT}
      </button>

      <form
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <Row tile={<Tile src="/profile/person.svg" width={18} height={18} />}>
          <div className="grid grid-cols-2 gap-x-4">
            <div>
              <p className={LABEL} id="profile-first-name">{FIRST_NAME}</p>
              {editing ? (
                <input
                  className={FIELD}
                  aria-labelledby="profile-first-name"
                  value={draft.first_name}
                  onChange={(e) => onChange("first_name", e.target.value)}
                  autoComplete="given-name"
                  maxLength={255}
                />
              ) : (
                <p className={`${VALUE} truncate`}>{user.first_name}</p>
              )}
            </div>
            <div>
              <p className={LABEL} id="profile-last-name">{LAST_NAME}</p>
              {editing ? (
                <input
                  className={FIELD}
                  aria-labelledby="profile-last-name"
                  value={draft.last_name}
                  onChange={(e) => onChange("last_name", e.target.value)}
                  autoComplete="family-name"
                  maxLength={255}
                />
              ) : (
                <p className={`${VALUE} truncate`}>{user.last_name}</p>
              )}
            </div>
          </div>
        </Row>

        <div className="mt-3">
          <Row tile={<Tile src="/profile/mail.svg" width={16} height={13} />}>
            {editing ? (
              <>
                <input
                  className={FIELD}
                  {...emailInput.props}
                  aria-label="Email"
                  aria-describedby={emailInput.rejected ? "profile-email-hint" : undefined}
                  value={draft.email}
                  maxLength={255}
                />
                {emailInput.rejected && (
                  <p id="profile-email-hint" className="mt-1 text-[12px] text-[#b42318]" role="status">
                    {EMAIL_ASCII_HINT}
                  </p>
                )}
              </>
            ) : (
              <p className={`${VALUE} truncate`}>
                <span className="sr-only">Email </span>
                {user.email}
              </p>
            )}
          </Row>
        </div>

        <div className="mt-4">
          <Row tile={<Tile src="/profile/lock.svg" width={19} height={19} />}>
            <p className={LABEL}>
              {PASSWORD}{" "}
              <a
                href={CHANGE_PASSWORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#54d3da] hover:underline"
                aria-label="Change password (opens your Xero account)"
              >
                {CHANGE}
              </a>
            </p>
          </Row>
        </div>

        {editing ? (
          <div className="mt-4 flex flex-col items-end gap-2">
            {error ? (
              <p className="w-full text-xs text-[#b42318]" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-xl bg-[#54d3da] px-6 py-2 text-sm font-medium text-white hover:bg-[#54d3da]/80 disabled:cursor-default disabled:opacity-60"
            >
              {saving ? "Saving…" : SAVE}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
