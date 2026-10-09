/**
 * The red asterisk that says a field is mandatory.
 *
 * `aria-hidden`, because an asterisk read aloud is "star" - requiredness reaches assistive tech
 * from the CONTROL (`aria-required` / `required`), not from this. Both halves are needed: the
 * mark for people who can see it, the attribute for people who cannot.
 *
 * The colour is the one the repo already used inline before this component existed, so nothing
 * moves visually.
 */
export function RequiredMark() {
  return (
    <span className="text-red-500" aria-hidden>
      {" *"}
    </span>
  );
}
