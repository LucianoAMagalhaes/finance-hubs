"use client";

import { useState } from "react";

/**
 * An action that goes to the server and comes back with the refusal, or null
 * if it worked. While it runs, `running` disables what the person could press
 * twice; the refusal it brings back stays on the screen until the next run.
 *
 * One per component, not one per action: saving, deleting and ending the same
 * record share it, so two of them are never in flight at once.
 */
export function useAction() {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  return {
    refusal,
    running,
    /** Puts a refusal on the screen without going to the server: what the browser itself refuses. */
    refuse: setRefusal,
    clearRefusal: () => setRefusal(null),
    async run(action: () => Promise<string | null>): Promise<void> {
      setRunning(true);
      const result = await action();
      setRunning(false);
      setRefusal(result);
    },
  };
}
