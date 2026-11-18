// App entry: expo-router, plus the headless task that saves alarm-screen actions while the app is closed.
import 'expo-router/entry';
import { registerAlarmHeadlessTask } from './src/alarms/headless-task';

registerAlarmHeadlessTask();
