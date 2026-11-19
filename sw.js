// ACC Schedule Manager service worker — push notifications only.
// There is deliberately NO fetch handler here: this worker never caches
// or serves content, so it cannot serve a stale copy of the app. It only
// shows push notifications and opens the app when one is tapped.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }
  const title = data.title || "ACC Schedule Manager";
  const body = data.body || "You have a new notification.";
  const url = data.url || "/ACCScheduleManager/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: "/ACCScheduleManager/assets/icon-192.png",
      badge: "/ACCScheduleManager/assets/icon-192.png",
      data: { url: url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) ||
    "/ACCScheduleManager/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.indexOf(url) === 0 && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
