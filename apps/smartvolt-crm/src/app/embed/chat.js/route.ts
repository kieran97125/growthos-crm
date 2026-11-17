import { chatEmbedScript } from "@/lib/web-chat/embed";
import { publicConfig } from "@/lib/web-chat/public";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  let accentColor: string | undefined;
  if (query.has("widget") && query.has("site")) {
    try {
      accentColor = (
        await publicConfig(query.get("widget")!, query.get("site")!)
      ).accentColor;
    } catch {
      /* An unconfigured widget never exposes private settings. */
    }
  }
  const appOrigin = new URL(process.env.SMARTVOLT_APP_URL || request.url)
    .origin;
  return new Response(chatEmbedScript(appOrigin, accentColor), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
