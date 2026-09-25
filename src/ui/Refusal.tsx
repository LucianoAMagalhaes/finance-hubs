/**
 * Why what was asked for did not happen, announced to a screen reader the
 * moment it shows up. Takes the refusal instead of being guarded by the
 * caller: without one there is nothing to say.
 */
export function Refusal({ refusal }: { refusal: string | null }) {
  if (!refusal) return null;
  return (
    <p className="notice bad" role="alert">
      {refusal}
    </p>
  );
}
