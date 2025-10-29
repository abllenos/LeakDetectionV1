# Backend API Bug Report

## Issue Summary
The `/admin/LeakDetection/LeakDetectionReport` endpoint is not properly reading multipart/form-data fields from React Native clients.

## Endpoint
- **URL**: `https://dev-api.davao-water.gov.ph/dcwd-gis/api/v1/admin/LeakDetection/LeakDetectionReport`
- **Method**: POST
- **Content-Type**: multipart/form-data

## Problem
Only 3 fields are being saved to the database:
- ✅ `ReportedLocation`
- ✅ `ReportedLandmark`  
- ✅ `ReporterName`

**All other fields return null or 0** even though they are being sent in the FormData payload.

## Evidence

### What We Send (React Native FormData):
```javascript
{
  "geom": "125.598699, 7.060698",
  "RefNo": "202510UZB3",
  "ReferenceMtr": "V24010747J",
  "ReferenceRecaddrs": "407008",
  "DmaCode": "CB-03P",
  "JmsCode": "CB-03P",
  "ReportedNumber": "09764312547",
  "LeakTypeId": 38,
  "LeakCovering": 4,
  "Priority": 2,
  "ReportType": 1,
  "DispatchStat": 1,
  "LeakIndicator": 1,
  "LeakLocation": 1,
  "DtReported": "2025-10-27T23:45:05.907Z",
  "DtReceived": "2025-10-27T23:45:05.907Z",
  "ReporterType": 1,
  "EmpId": "002481",
  "ReportedLocation": "Matina",
  "ReportedLandmark": "Matina",
  "ReporterName": "Joe"
}
```

### What Backend Saves (Response data):
```json
{
  "geom": null,
  "refNo": "202510CA88",
  "reportType": 0,
  "reporterType": 0,
  "jmsCode": null,
  "dtReported": "0001-01-01T00:00:00",
  "leakTypeId": 0,
  "priority": 0,
  "leakIndicator": 0,
  "leakCovering": 0,
  "leakLocation": 0,
  "dmaCode": null,
  "referenceMtr": null,
  "referenceRecaddrs": null,
  "reportedLocation": "Matina",
  "reportedLandmark": "Matina",
  "reporterName": "Joe",
  "reportedNumber": null
}
```

## Root Cause
The .NET backend controller is not properly binding multipart/form-data fields to the model. This is likely due to:

1. **Missing [FromForm] attribute** on the model parameter
2. **Incorrect model binding configuration** for multipart/form-data
3. **Manual property binding** only for ReportedLocation, ReportedLandmark, and ReporterName

## Required Fix
The backend team needs to:

1. Add proper model binding attributes in the controller:
```csharp
[HttpPost("LeakDetectionReport")]
public async Task<IActionResult> SubmitReport([FromForm] LeakReportModel model)
{
    // ...
}
```

2. Ensure all properties in `LeakReportModel` match the FormData field names
3. Test with React Native FormData (not just curl/Postman)

## Impact
- Mobile app cannot submit leak reports with complete data
- Critical fields like `geom`, `ReferenceMtr`, `DmaCode` are not being saved
- Database constraint violations occur (e.g., "null value in column 'geom' violates not-null constraint")

## Temporary Workaround Needed
Until the backend is fixed, we need either:
1. An alternative endpoint that accepts JSON instead of FormData
2. Or confirmation of the exact FormData format the backend expects

## Test Case
You can reproduce this by:
1. Sending a multipart/form-data POST to the endpoint with all required fields
2. Checking the response - most fields will be null/0
3. Checking the database - only 3 fields are saved

---
**Date**: October 28, 2025  
**Reporter**: Mobile App Development Team  
**Priority**: High - Blocks leak report submission
