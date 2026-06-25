/**
 * YouthNavigator.js
 *
 * Entry point: YouthProfileSetup — open onboarding, no gate.
 *   All users enter immediately after saving name + phone.
 *   Background Firestore lookup resolves isLinkedToWorker asynchronously.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import YouthProfileSetup from '../screens/youth/YouthProfileSetup';
import YouthExteriorEdit from '../screens/youth/YouthExteriorEdit';
import YouthRoomHome from '../screens/youth/YouthRoomHome';
import YouthAICompanion from '../screens/youth/YouthAICompanion';
import YouthPinboardForum from '../screens/youth/YouthPinboardForum';
import YouthJournalShelf from '../screens/youth/YouthJournalShelf';
import YouthJournalArchive from '../screens/youth/YouthJournalArchive';
import YouthGardenPlot from '../screens/youth/YouthGardenPlot';

const Stack = createNativeStackNavigator();

export default function YouthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="YouthProfileSetup"
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#CDEDF6' },
      }}
    >
      <Stack.Screen name="YouthProfileSetup"  component={YouthProfileSetup} />
      <Stack.Screen name="YouthExteriorEdit"  component={YouthExteriorEdit} />
      <Stack.Screen name="YouthRoomHome"      component={YouthRoomHome} />
      <Stack.Screen name="YouthGardenPlot"    component={YouthGardenPlot} />
      <Stack.Screen name="YouthAICompanion"   component={YouthAICompanion} />
      <Stack.Screen name="YouthPinboardForum" component={YouthPinboardForum} />
      <Stack.Screen name="YouthJournalShelf"  component={YouthJournalShelf} />
      <Stack.Screen name="YouthJournalArchive" component={YouthJournalArchive} />
    </Stack.Navigator>
  );
}
