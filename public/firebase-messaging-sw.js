self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'CrowdCivic AI Alert', body: 'You have a new civic update.' };
  try {
    const json = event.data.json();
    payload = {
      title: json?.notification?.title || json?.data?.title || payload.title,
      body: json?.notification?.body || json?.data?.body || payload.body,
    };
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
    })
  );
});
