import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification handler
try {
  if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } else {
    console.warn('Notifications module is not available');
  }
} catch (error) {
  console.warn('Failed to set notification handler:', error);
}

export const NotificationService = {
  /**
   * Request permissions for push notifications
   */
  async registerForPushNotificationsAsync(): Promise<boolean> {
    try {
      if (!Notifications || !Notifications.getPermissionsAsync) {
        console.warn('Notifications module is not available');
        return false;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daily-reminder', {
          name: 'Daily Reminder',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
  
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
  
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn('Failed to register for push notifications:', error);
      return false;
    }
  },

  /**
   * Schedule a daily reminder at the specified hour and minute
   * @param hour 0-23
   * @param minute 0-59
   */
  async scheduleDailyReminder(hour: number, minute: number) {
    try {
      if (!Notifications || !Notifications.scheduleNotificationAsync) return;

      // Cancel existing reminders first to avoid duplicates
      await this.cancelAllNotifications();
  
      const trigger: Notifications.NotificationTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      };
  
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "今日もお話しませんか？",
          body: "AIがあなたの1日の出来事を聞くのを楽しみに待っています。",
          sound: true,
        },
        trigger,
      });
      
      console.log(`Scheduled daily reminder for ${hour}:${minute}`);
    } catch (error) {
      console.warn('Failed to schedule daily reminder:', error);
    }
  },

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications() {
    try {
      if (Notifications && Notifications.cancelAllScheduledNotificationsAsync) {
        await Notifications.cancelAllScheduledNotificationsAsync();
        console.log('Cancelled all notifications');
      }
    } catch (error) {
      console.warn('Failed to cancel notifications:', error);
    }
  }
};
