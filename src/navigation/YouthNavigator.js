/**
 * YouthNavigator.js
 *
 * Self-contained native stack for the Youth Portal. This is a NEW file — the
 * existing RootNavigator.js (worker/volunteer flows) is intentionally left
 * untouched, keeping the two portals isolated.
 *
 * To mount it later (one line, when you're ready), add to RootNavigator's stack:
 *     <Stack.Screen name="YouthPortal" component={YouthNavigator} />
 * and navigate('YouthPortal') from wherever the youth entry point lives.
 *
 * Flow: ExteriorEdit → (Apply) → RoomHome → {AICompanion | PinboardForum},
 * and RoomHome's door returns to ExteriorEdit.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import YouthExteriorEdit from '../screens/youth/YouthExteriorEdit';
import YouthRoomHome from '../screens/youth/YouthRoomHome';
import YouthAICompanion from '../screens/youth/YouthAICompanion';
import YouthPinboardForum from '../screens/youth/YouthPinboardForum';
import YouthJournalShelf from '../screens/youth/YouthJournalShelf';
import YouthJournalArchive from '../screens/youth/YouthJournalArchive';

const Stack = createNativeStackNavigator();

export default function YouthNavigator() {
  return (
    <Stack.Navigator
      // Normal flow starts at YouthExteriorEdit. Booting at the room so the
      // bookshelf -> Journaling Shelf route is immediately testable.
      initialRouteName="YouthRoomHome"
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#CDEDF6' },
      }}
    >
      <Stack.Screen name="YouthExteriorEdit" component={YouthExteriorEdit} />
      <Stack.Screen name="YouthRoomHome" component={YouthRoomHome} />
      <Stack.Screen name="YouthAICompanion" component={YouthAICompanion} />
      <Stack.Screen name="YouthPinboardForum" component={YouthPinboardForum} />
      <Stack.Screen name="YouthJournalShelf" component={YouthJournalShelf} />
      <Stack.Screen name="YouthJournalArchive" component={YouthJournalArchive} />
    </Stack.Navigator>
  );
}
