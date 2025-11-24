// NotificationStore.js
import { makeAutoObservable } from 'mobx';

class NotificationStore {
  notifications = [];

  constructor() {
    makeAutoObservable(this);
  }

  addNotification(type, message) {
    this.notifications.push({ type, message, id: Date.now() });
    // Optionally auto-remove after timeout
    setTimeout(() => {
      this.removeNotification(this.notifications[0]?.id);
    }, 4000);
  }

  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }
}

const notificationStore = new NotificationStore();
export default notificationStore;
