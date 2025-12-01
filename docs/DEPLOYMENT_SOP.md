# LeakDetection App - Deployment Standard Operating Procedure (SOP)

**Document Version:** 1.0  
**Last Updated:** December 1, 2025  
**Author:** Development Team  
**Classification:** Internal Use Only

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Scope](#2-scope)
3. [Roles and Responsibilities](#3-roles-and-responsibilities)
4. [Pre-Deployment Checklist](#4-pre-deployment-checklist)
5. [Build Process](#5-build-process)
6. [Testing Requirements](#6-testing-requirements)
7. [Deployment Procedure](#7-deployment-procedure)
8. [Post-Deployment Verification](#8-post-deployment-verification)
9. [Rollback Procedure](#9-rollback-procedure)
10. [Version History Tracking](#10-version-history-tracking)
11. [Approval Sign-Off](#11-approval-sign-off)

---

## 1. Purpose

This Standard Operating Procedure (SOP) establishes the guidelines and procedures for deploying the LeakDetection mobile application to the Google Play Store. The purpose is to ensure consistent, reliable, and error-free deployments while maintaining quality standards and compliance requirements.

---

## 2. Scope

This SOP applies to:
- Production releases of the LeakDetection Android application
- All team members involved in the build and deployment process
- Both scheduled releases and emergency hotfix deployments

**Out of Scope:**
- iOS deployments (not currently supported)
- Development/staging builds
- Internal testing distributions

---

## 3. Roles and Responsibilities

| Role | Responsibilities |
|------|------------------|
| **Developer** | Code completion, build generation, initial testing |
| **QA Lead** | Testing verification, sign-off on quality |
| **Release Manager** | Deployment execution, Play Store upload |
| **Project Manager** | Final approval, stakeholder communication |
| **IT Support** | Infrastructure and access management |

### Contact Information

| Role | Name | Contact |
|------|------|---------|
| Release Manager | [Name] | [Email/Phone] |
| QA Lead | [Name] | [Email/Phone] |
| Project Manager | [Name] | [Email/Phone] |
| Emergency Contact | [Name] | [Email/Phone] |

---

## 4. Pre-Deployment Checklist

### 4.1 Code Readiness

- [ ] All features for this release are complete and merged to `main` branch
- [ ] All pull requests have been reviewed and approved
- [ ] No critical or high-priority bugs are open for this release
- [ ] Code freeze is in effect (no new commits during deployment)

### 4.2 Documentation

- [ ] Release notes are prepared
- [ ] Changelog is updated in `DOCUMENTATION.md`
- [ ] Any API changes are documented
- [ ] User-facing changes are documented for support team

### 4.3 Environment Verification

- [ ] Android Studio is updated to latest stable version
- [ ] Java Development Kit (JDK 17) is installed and configured
- [ ] All environment variables are properly set:
  - `ANDROID_HOME`
  - `JAVA_HOME`
- [ ] Signing keystore is accessible and credentials verified
- [ ] Google Play Console access is confirmed

### 4.4 Stakeholder Notification

- [ ] Notify stakeholders of planned deployment window
- [ ] Confirm deployment time with all parties
- [ ] Ensure support team is aware of upcoming release

---

## 5. Build Process

### 5.1 Quick Build (Recommended)

Use the automated version bump script for production builds:

```powershell
# Navigate to project directory
cd c:\Users\lamig\LeakDetectionV1

# Build with automatic version increment
node scripts/bumpVersion.js --build
```

**Version Increment Options:**

| Command | Description | Example |
|---------|-------------|---------|
| `node scripts/bumpVersion.js --build` | Increment patch version (default) | 1.0.0 → 1.0.1 |
| `node scripts/bumpVersion.js --build --minor` | Increment minor version | 1.0.0 → 1.1.0 |
| `node scripts/bumpVersion.js --build --major` | Increment major version | 1.0.0 → 2.0.0 |

### 5.2 Manual Build (Alternative)

If manual build is required:

```powershell
# Step 1: Navigate to Android directory
cd android

# Step 2: Clean previous builds
.\gradlew clean

# Step 3: Build release AAB
.\gradlew bundleRelease
```

### 5.3 Build Output

The signed Android App Bundle (AAB) will be located at:
```
android/app/build/outputs/bundle/release/app-release.aab
```

### 5.4 Build Verification

After build completion, verify:

- [ ] Build completed without errors
- [ ] AAB file exists at expected location
- [ ] File size is reasonable (compare to previous builds)
- [ ] Version number is correct in build output

---

## 6. Testing Requirements

### 6.1 Smoke Testing

Before deployment, perform the following smoke tests on the generated APK/AAB:

| Test Case | Expected Result | Pass/Fail |
|-----------|-----------------|-----------|
| App launches successfully | Splash screen appears, navigates to login | [ ] |
| User can log in | Login successful with valid credentials | [ ] |
| Dashboard loads | All dashboard data displays correctly | [ ] |
| Map functionality works | Map renders, location displays | [ ] |
| Offline mode functions | App works without network connection | [ ] |
| Leak report submission | Report submits successfully (test environment) | [ ] |
| Auto-logout triggers | Session expires after inactivity period | [ ] |

### 6.2 Regression Testing

- [ ] Critical user flows tested
- [ ] Previous bug fixes verified
- [ ] Performance benchmarks met

### 6.3 Device Testing

Test on minimum of 3 device configurations:

| Device Type | Android Version | Tested | Notes |
|-------------|-----------------|--------|-------|
| Low-end device | Android 8.0+ | [ ] | |
| Mid-range device | Android 10+ | [ ] | |
| High-end device | Android 13+ | [ ] | |

---

## 7. Deployment Procedure

### 7.1 Pre-Deployment Steps

1. **Verify Build**
   ```powershell
   # Confirm AAB exists
   Test-Path "android/app/build/outputs/bundle/release/app-release.aab"
   ```

2. **Backup Current Version**
   - Download current production APK from Play Store
   - Store in versioned backup folder

3. **Final Approval**
   - Obtain sign-off from QA Lead
   - Obtain sign-off from Project Manager

### 7.2 Google Play Console Upload

1. **Access Play Console**
   - Navigate to [Google Play Console](https://play.google.com/console)
   - Log in with authorized account
   - Select "LeakDetection" app

2. **Create New Release**
   - Go to **Production** → **Releases**
   - Click **Create new release**

3. **Upload AAB**
   - Upload `app-release.aab`
   - Wait for processing to complete
   - Verify no errors or warnings

4. **Release Information**
   - Enter release name (e.g., "Version 1.2.3")
   - Add release notes (user-facing changes)
   - Select countries/regions for release

5. **Review and Publish**
   - Review all information
   - Click **Start rollout to Production**
   - Confirm rollout percentage:
     - **Standard Release:** 100% rollout
     - **Staged Rollout:** Start with 10%, increase over 7 days

### 7.3 Rollout Strategy

| Rollout Type | Percentage | Duration | Use Case |
|--------------|------------|----------|----------|
| Full Rollout | 100% | Immediate | Bug fixes, minor updates |
| Staged Rollout | 10% → 50% → 100% | 7 days | Major features, significant changes |
| Controlled Rollout | 5% | Monitored | High-risk changes |

---

## 8. Post-Deployment Verification

### 8.1 Immediate Verification (Within 1 Hour)

- [ ] App appears in Play Store with correct version
- [ ] Download and install from Play Store
- [ ] Complete basic smoke test on production build
- [ ] Verify analytics/crash reporting is functional
- [ ] Check backend logs for any errors

### 8.2 Monitoring Period (24-72 Hours)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Crash Rate | < 1% | | [ ] |
| ANR Rate | < 0.5% | | [ ] |
| User Ratings | ≥ 4.0 | | [ ] |
| Uninstall Rate | < 5% | | [ ] |

### 8.3 Communication

- [ ] Notify stakeholders of successful deployment
- [ ] Update internal status page/channel
- [ ] Send release notification to support team
- [ ] Document any issues encountered

---

## 9. Rollback Procedure

### 9.1 When to Rollback

Initiate rollback if any of the following occur:
- Crash rate exceeds 5%
- Critical functionality is broken
- Security vulnerability discovered
- Data integrity issues identified
- Significant user complaints

### 9.2 Rollback Steps

1. **Halt Rollout (if staged)**
   - In Play Console, click **Halt rollout**
   - This prevents new users from receiving the update

2. **Revert to Previous Version**
   - In Play Console, go to **Release history**
   - Find previous stable release
   - Click **Release to Production**
   - Upload previous AAB if needed

3. **Communication**
   - Immediately notify all stakeholders
   - Document the issue and reason for rollback
   - Create incident report

### 9.3 Post-Rollback Actions

- [ ] Incident report created
- [ ] Root cause analysis initiated
- [ ] Fix timeline established
- [ ] Stakeholders updated

---

## 10. Version History Tracking

### Release Log Template

| Version | Date | Type | Changes | Deployed By | Notes |
|---------|------|------|---------|-------------|-------|
| 1.0.0 | YYYY-MM-DD | Initial | Initial release | [Name] | |
| 1.0.1 | YYYY-MM-DD | Patch | Bug fixes | [Name] | |
| 1.1.0 | YYYY-MM-DD | Minor | New features | [Name] | |

### Current Version Information

- **Current Production Version:** Check `app.config.js`
- **Build Number:** Check `android/app/build.gradle`

To check current version:
```powershell
# View current version
Get-Content app.config.js | Select-String "version"
```

---

## 11. Approval Sign-Off

### Pre-Deployment Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Developer | | | |
| QA Lead | | | |
| Project Manager | | | |

### Post-Deployment Confirmation

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Release Manager | | | |
| QA Lead | | | |

---

## Appendix A: Troubleshooting

### Common Build Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Gradle build fails | Outdated dependencies | Run `.\gradlew clean` and retry |
| Signing error | Keystore not found | Verify keystore path in `build.gradle` |
| Out of memory | Insufficient heap size | Increase in `gradle.properties` |
| SDK not found | ANDROID_HOME not set | Set environment variable |

### Common Deployment Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Upload rejected | Version code not incremented | Increment `versionCode` in build.gradle |
| Deobfuscation warning | Missing mapping file | Upload proguard mapping file |
| Country restriction | Compliance issue | Review content policies |

---

## Appendix B: Emergency Contacts

| Situation | Contact | Method |
|-----------|---------|--------|
| Build Failure | Developer Lead | Teams/Phone |
| Deployment Blocked | IT Support | Helpdesk Ticket |
| Critical Bug in Production | On-Call Developer | Phone |
| Play Store Account Issue | Project Manager | Email/Phone |

---

## Appendix C: Reference Documents

- [DOCUMENTATION.md](./DOCUMENTATION.md) - Full technical documentation
- [README.md](../README.md) - Project overview
- [OFFLINE_SYSTEM.md](./OFFLINE_SYSTEM.md) - Offline functionality documentation
- [AUTO_LOGOUT_FEATURE.md](../AUTO_LOGOUT_FEATURE.md) - Auto-logout feature documentation

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | December 1, 2025 | Development Team | Initial SOP creation |

**Review Schedule:** This document should be reviewed and updated quarterly or after any significant process changes.

---

*End of Document*
