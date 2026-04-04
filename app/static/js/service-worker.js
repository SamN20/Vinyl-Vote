self.addEventListener("push", function(event) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/static/icon.png", // optional
        data: data.url || "/"
      })
    );
  });
  
  self.addEventListener("notificationclick", function(event) {
    event.notification.close();
    if (event.notification.data) {
      clients.openWindow(event.notification.data);
    }
  });

  // Handle app resume/focus for better session management
  self.addEventListener('message', event => {
    if (event.data && event.data.type === 'APP_RESUME') {
      // Notify clients that app has resumed
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'CHECK_SESSION'
          });
        });
      });
    }
  });

  // Cache strategy for better offline experience
  self.addEventListener('fetch', event => {
    // Only handle same-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
      return;
    }
    
    // Skip authentication-related requests to ensure fresh responses
    if (event.request.url.includes('/login') || 
        event.request.url.includes('/logout') || 
        event.request.url.includes('/oauth/')) {
      return;
    }

    event.respondWith(
      fetch(event.request).catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
    );
  });
  