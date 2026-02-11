// import * as Notifications from 'expo-notifications'; // Removed for Personal Team compatibility

// Configure notification handler
try {
  // Notifications module removed
  console.log('Notifications module disabled for Personal Team build');
} catch (error) {
  console.warn('Failed to set notification handler:', error);
}

export const NotificationService = {
  /**
   * Request permissions for push notifications
   */
  async registerForPushNotificationsAsync(): Promise<boolean> {
    console.log('registerForPushNotificationsAsync: Disabled for Personal Team build');
    return false;
  },

  /**
   * Schedule a daily reminder at the specified hour and minute
   * @param hour 0-23
   * @param minute 0-59
   */
  async scheduleDailyReminder(hour: number, minute: number) {
    console.log(`scheduleDailyReminder: Disabled for Personal Team build (${hour}:${minute})`);
  },

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications() {
     console.log('cancelAllNotifications: Disabled for Personal Team build');
  }
};
