/* Generic reminders only; customer details require a fresh signed-in read. */
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  const url =
    typeof data.url === "string" &&
    /^\/company\/[a-f0-9-]{36}\/crm\/notifications$/.test(data.url)
      ? data.url
      : "/";
  event.waitUntil(
    self.registration.showNotification("Convelta 有新跟進提醒", {
      body: "開啟工作台查看。",
      tag: String(data.tag ?? "convelta"),
      data: { url },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url ?? "/",
    self.location.origin,
  );
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients) {
          if (client.url === url.href) {
            await client.focus();
            return;
          }
        }
        await self.clients.openWindow(url.href);
      }),
  );
});
