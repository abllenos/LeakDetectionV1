import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ReportScreen from '../screens/ReportScreen';
import SettingsScreen from '../screens/SettingsScreen';
import HomeScreen from '../screens/HomeScreen';
import LeakReportFormScreen from '../screens/LeakReportFormScreen';
import ReportHomeScreen from '../screens/ReportHomeScreen';
import FindNearestScreen from '../screens/FindNearestScreen';
import NearestMetersScreen from '../screens/NearestMetersScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const ReportStack = createStackNavigator();

function ReportStackNavigator() {
  return (
    <ReportStack.Navigator 
      screenOptions={{ 
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' }
      }}
    >
      <ReportStack.Screen 
        name="ReportHome" 
        component={ReportHomeScreen}
        options={{ 
          cardStyle: { backgroundColor: 'transparent' }
        }}
      />
      <ReportStack.Screen 
        name="ReportMap" 
        component={ReportScreen}
        options={{ 
          cardStyle: { backgroundColor: 'transparent' }
        }}
      />
      <ReportStack.Screen 
        name="FindNearest" 
        component={FindNearestScreen}
        options={{ 
          cardStyle: { backgroundColor: 'transparent' }
        }}
      />
      <ReportStack.Screen 
        name="NearestMeters" 
        component={NearestMetersScreen}
        options={{ 
          cardStyle: { backgroundColor: 'transparent' }
        }}
      />
    </ReportStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1e5a8e',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#eee',
        },
        tabBarIcon: ({ color, size }) => {
          let iconName = 'home';
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'Report') iconName = 'location';
          else if (route.name === 'Settings') iconName = 'settings';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Report" component={ReportStackNavigator} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="LeakReportForm" component={LeakReportFormScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
