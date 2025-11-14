# 24-Hour Auto-Logout - Quick Reference

## Summary

Users will be automatically logged out if they remain offline for 24 consecutive hours. This security feature ensures that offline access is time-limited.

## Key Points

✅ **Timer starts**: When user goes offline  
✅ **Timer resets**: Every time user reconnects to internet  
✅ **Timeout duration**: 24 hours  
✅ **Check frequency**: Every 5 minutes  
✅ **Warning displayed**: In Settings → Offline Queue (when offline)  
✅ **Data preserved**: Queued reports remain after logout  

## How to Test (Quick)

For quick testing, temporarily change the timeout:

**File:** `stores/OfflineStore.js`  
**Line:** ~14

```javascript
// Change from:
const OFFLINE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

// To (for testing):
const OFFLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
```

**Test Steps:**
1. Login while online
2. Enable airplane mode
3. Wait 2 minutes
4. See "Session Expired" alert
5. User logged out automatically

**⚠️ Remember to revert the change after testing!**

## What Happens on Timeout

1. Alert shown: "Session Expired - You have been offline for more than 24 hours..."
2. User taps "OK"
3. Location tracking stopped
4. Auth tokens cleared
5. Navigate to Splash screen
6. User must login again

## User View

### In Settings Screen (When Offline)

```
┌─────────── Offline Queue ────────────┐
│ Network Status: ● Offline            │
│                                       │
│ ⚠️ Auto-logout Timer                 │
│ You will be automatically logged     │
│ out in 23h 45m if you remain         │
│ offline.                              │
└───────────────────────────────────────┘
```

### Alert When Timeout Reached

```
╔═══════════════════════════════════════╗
║        Session Expired                 ║
║                                        ║
║ You have been offline for more than   ║
║ 24 hours. Please login again to       ║
║ continue using the app.               ║
║                                        ║
║                    [OK]               ║
╚═══════════════════════════════════════╝
```

## Files Modified

- `stores/OfflineStore.js` - Core timeout logic
- `App.js` - Logout callback setup
- `navigation/AppNavigator.js` - Navigation ref support
- `screens/SettingsScreen.js` - Remaining time display
- `AUTO_LOGOUT_FEATURE.md` - Full documentation

## Configuration

**Timeout Duration:**  
`stores/OfflineStore.js` → `OFFLINE_TIMEOUT_MS`

**Check Interval:**  
`stores/OfflineStore.js` → `startOfflineTimeoutCheck()` → 5 minutes

**Storage Key:**  
`last_online_timestamp` in AsyncStorage

---

For detailed documentation, see `AUTO_LOGOUT_FEATURE.md`
