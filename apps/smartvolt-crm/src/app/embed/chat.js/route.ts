import { chatEmbedScript } from "@/lib/web-chat/embed";
export async function GET(request: Request) {
  const appOrigin = new URL(process.env.SMARTVOLT_APP_URL || request.url)
    .origin;
  return new Response(chatEmbedScript(appOrigin), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
