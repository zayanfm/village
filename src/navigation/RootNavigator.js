/**
 * RootNavigator.js
 *
 * Native Stack at the root. The stack's first screen is the 5-tab bottom-bar
 * navigator (driven by the custom glass CustomBottomBar). Detail flows
 * (YouthCaseDetail, CaseManagementForm) are pushed on top of the tabs so the
 * floating bar hides during the deep case-management journey.
 *
 * Tab order (strictly L->R) matches CustomBottomBar:
 *   Profile · Forum · Home (center) · Calendar · Future
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import CustomBottomBar from '../components/CustomBottomBar';

import Profile from '../screens/volunteer/Profile';
import PeerForum from '../screens/volunteer/PeerForum';
import VolunteerHome from '../screens/volunteer/VolunteerHome';
import Calendar from '../screens/volunteer/Calendar';
import FutureFeature from '../screens/volunteer/FutureFeature';
import YouthCaseDetail from '../screens/volunteer/YouthCaseDetail';
import CaseManagementForm from '../screens/worker/CaseManagementForm';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      // Home is the elevated center tab and the primary landing portal.
      initialRouteName="Home"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomBottomBar {...props} />}
    >
      <Tab.Screen name="Profile" component={Profile} />
      <Tab.Screen name="Forum" component={PeerForum} />
      <Tab.Screen name="Home" component={VolunteerHome} />
      <Tab.Screen name="Calendar" component={Calendar} />
      <Tab.Screen name="Future" component={FutureFeature} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#06140F' },
      }}
    >
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="YouthCaseDetail" component={YouthCaseDetail} />
      <Stack.Screen name="CaseManagementForm" component={CaseManagementForm} />
    </Stack.Navigator>
  );
}
