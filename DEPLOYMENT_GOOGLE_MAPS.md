# Google Maps API Production Deployment Guide

## Overview
Your production deployment is missing the Google Maps API key, which is causing address autofill failures. Follow these steps to fix it.

## Quick Fix for Production

### Step 1: Identify Your Deployment Platform

**If using GitHub Pages / Static Hosting:**
- The API key must be embedded during build time
- Set environment variables in your CI/CD pipeline

**If using Docker:**
- Pass the API key as a build argument
- Or set it in your `.env` file

**If using a Platform (Vercel, Netlify, etc.):**
- Add environment variables in the platform dashboard
- Rebuild and redeploy

### Step 2: Configure Environment Variables

#### Option A: GitHub Actions (Recommended)
1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add a new repository secret:
   - Name: `REACT_APP_GOOGLE_MAPS_API_KEY`
   - Value: Your Google Maps API key

4. Update `.github/workflows/docker-ci.yml` to pass the secret during build:
```yaml
- name: Build Frontend
  uses: docker/build-push-action@v4
  with:
    context: ./frontend
    push: false
    load: true
    build-args: |
      REACT_APP_API_URL=/api
      REACT_APP_GOOGLE_MAPS_API_KEY=${{ secrets.REACT_APP_GOOGLE_MAPS_API_KEY }}
    tags: target-logistics-frontend:test
```

#### Option B: Docker Compose
1. Create a `.env` file in the project root:
```bash
REACT_APP_GOOGLE_MAPS_API_KEY=AIzaSyA_ZT_vtQaASzRUy8OWIuvfqDQzBY_5NCY
REACT_APP_MAPBOX_TOKEN=your_mapbox_token
```

2. Build with Docker Compose:
```bash
docker-compose up --build -d
```

#### Option C: Direct Docker Build
```bash
cd frontend
docker build \
  --build-arg REACT_APP_GOOGLE_MAPS_API_KEY=your_key_here \
  --build-arg REACT_APP_API_URL=/api \
  -t target-logistics-frontend .
```

### Step 3: Verify the Fix

After deploying, open your browser console and check:
1. ✅ No "NoApiKeys" errors
2. ✅ Address autofill works when typing in address fields
3. ⚠️ Deprecation warnings are expected (library issue, not critical)

## About Deprecation Warnings

The console warnings about `AutocompleteService` being deprecated are from the `use-places-autocomplete` library. This is a **non-critical issue**:

- ✅ Functionality still works
- ✅ Google provides 12+ months notice before discontinuation
- ⏳ Wait for library maintainer to update to new API

You can safely ignore these warnings for now. The address autofill will continue to work.

## Troubleshooting

### Issue: "Google Maps API key not configured" error
**Solution:** The API key was not passed during build. Re-build with the environment variable set.

### Issue: "RefererNotAllowedMapError"
**Solution:** Configure API key restrictions in Google Cloud Console to allow your production domain.

### Issue: Address suggestions not appearing
**Solution:** 
1. Verify the Places API is enabled in Google Cloud Console
2. Check browser console for specific error messages
3. Ensure API key has proper permissions

## API Key Setup (If You Don't Have One)

1. Go to [Google Cloud Console](https://console.cloud.google.com/google/maps-apis)
2. Create a new project (or select existing)
3. Enable these APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API
4. Create credentials → API Key
5. (Recommended) Restrict the key to your domain

## Next Steps After Deployment

1. Monitor console for errors in production
2. Test address autofill functionality
3. Consider upgrading `use-places-autocomplete` library when new version is available
