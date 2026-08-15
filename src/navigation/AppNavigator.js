import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MemberListScreen from '../screens/MemberListScreen';
import MemberProfileScreen from '../screens/MemberProfileScreen';
import FamilyScreen from '../screens/FamilyScreen';
import FamilyListScreen from '../screens/FamilyListScreen';
import AddFamilyScreen from '../screens/AddFamilyScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import EventsScreen from '../screens/EventsScreen';
import OrganizationsScreen from '../screens/OrganizationsScreen';
import QRScreen from '../screens/QRScreen';
import SearchScreen from '../screens/SearchScreen';
import SacramentsScreen from '../screens/SacramentsScreen';
import DonationsScreen from '../screens/DonationsScreen';
import CertificatesScreen from '../screens/CertificatesScreen';
import AddMemberScreen from '../screens/AddMemberScreen';
import EditMemberScreen from '../screens/EditMemberScreen';
import ManageUsersScreen from '../screens/ManageUsersScreen';
import AddUserScreen from '../screens/AddUserScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import ParishSettingsScreen from '../screens/ParishSettingsScreen';
import ManageBccScreen from '../screens/ManageBccScreen';
import BccUnitsScreen from '../screens/BccUnitsScreen';
import BccFamiliesScreen from '../screens/BccFamiliesScreen';
import LiturgyScheduleScreen from '../screens/LiturgyScheduleScreen';
import LiturgyAssignScreen from '../screens/LiturgyAssignScreen';
import MemberSelfEditScreen from '../screens/MemberSelfEditScreen';

const Stack = createNativeStackNavigator();

// Modules from the doc that reuse the generic placeholder pattern until a
// dedicated screen + endpoint is built.
const PLACEHOLDERS = [
  { name: 'PrayerRequests', title: 'Prayer Requests', icon: 'heart' },
  { name: 'Documents', title: 'Documents', icon: 'document-text' },
  { name: 'Reports', title: 'Reports', icon: 'bar-chart' },
  { name: 'News', title: 'Parish News', icon: 'newspaper' },
];

export default function AppNavigator({ navigationRef }) {
  const { user, initializing } = useAuth();

  if (initializing) return null; // App.js already shows a splash spinner during font load; this covers auth resolution too.

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="MemberList" component={MemberListScreen} />
            <Stack.Screen name="MemberProfile" component={MemberProfileScreen} />
            <Stack.Screen name="AddMember" component={AddMemberScreen} />
            <Stack.Screen name="EditMember" component={EditMemberScreen} />
            <Stack.Screen name="Profile" component={MemberProfileScreen} />
            <Stack.Screen name="Family" component={FamilyScreen} />
            <Stack.Screen name="FamilyList" component={FamilyListScreen} />
            <Stack.Screen name="AddFamily" component={AddFamilyScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Events" component={EventsScreen} />
            <Stack.Screen name="Organizations" component={OrganizationsScreen} />
            <Stack.Screen name="QR" component={QRScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Sacraments" component={SacramentsScreen} />
            <Stack.Screen name="Donations" component={DonationsScreen} />
            <Stack.Screen name="Certificates" component={CertificatesScreen} />
            <Stack.Screen name="ManageUsers" component={ManageUsersScreen} />
            <Stack.Screen name="AddUser" component={AddUserScreen} />
            <Stack.Screen name="ParishSettings" component={ParishSettingsScreen} />
            <Stack.Screen name="ManageBcc" component={ManageBccScreen} />
            <Stack.Screen name="BccUnits" component={BccUnitsScreen} />
            <Stack.Screen name="BccFamilies" component={BccFamiliesScreen} />
            <Stack.Screen name="LiturgySchedule" component={LiturgyScheduleScreen} />
            <Stack.Screen name="LiturgyAssign" component={LiturgyAssignScreen} />
            <Stack.Screen name="MemberSelfEdit" component={MemberSelfEditScreen} />
            {PLACEHOLDERS.map((p) => (
              <Stack.Screen
                key={p.name}
                name={p.name}
                component={PlaceholderScreen}
                initialParams={{ title: p.title, icon: p.icon }}
              />
            ))}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
