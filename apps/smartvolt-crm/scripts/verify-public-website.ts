import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initialWebsiteState,
  stepWebsiteState,
} from "../src/lib/website/crawl";
async function main() {
  const target = process.argv[2];
  if (!target)
    throw Error(
      "Pass a public HTTPS website for the read-only scanner acceptance.",
    );
  const result = await stepWebsiteState(
    initialWebsiteState(target),
    "isolated-acceptance",
    "brand",
    randomUUID(),
  );
  assert.ok(
    result.state.pages.length > 0,
    `No readable public page: ${result.state.warnings.map((w) => w.reason).join("; ")}`,
  );
  assert.ok(result.state.candidates.length > 0);
  assert.ok(
    result.state.candidates.every(
      (a) => a.status === "approved" && a.website?.url.startsWith("https://"),
    ),
  );
  console.log(
    JSON.stringify({
      publicHost: new URL(target).hostname,
      pages: result.state.pages.length,
      readableCharacters: result.state.pages.reduce(
        (n, p) => n + p.text.length,
        0,
      ),
      faqCandidates: result.state.candidates.length,
      persistedCompanyRecords: 0,
    }),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
