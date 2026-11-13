import type { WaSendResult } from "./types";

/** The SQL claim is the only permission to invoke a provider. Never retry an ambiguous send. */
export async function dispatchClaim<T>(options: {
  claim: { dispatch: boolean; message: T };
  send: () => Promise<WaSendResult>;
  finish: (outcome: WaSendResult) => Promise<T>;
}): Promise<{ message: T; dispatched: boolean; ambiguous: boolean }> {
  if (!options.claim.dispatch)
    return {
      message: options.claim.message,
      dispatched: false,
      ambiguous: false,
    };
  let outcome: WaSendResult;
  try {
    outcome = await options.send();
  } catch {
    outcome = { ok: false, disposition: "ambiguous", code: "delivery_unknown" };
  }
  const message = await options.finish(outcome);
  return {
    message,
    dispatched: true,
    ambiguous: !outcome.ok && outcome.disposition === "ambiguous",
  };
}
