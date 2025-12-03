# KtrlPlane Authentication Integration - Implementation Summary

## Overview

This implementation adds KtrlPlane platform authentication to Graph Explorer, allowing users to sign in and automatically access their managed Graph resources.

## Key Features

✅ **Silent Authentication**: Automatic token refresh with Auth0  
✅ **Manual Login**: Sign in through user menu when needed  
✅ **Dual Audiences**: Separate tokens for KtrlPlane API and Graph API  
✅ **Automatic Resource Discovery**: Graph resources appear in connection selector when signed in  
✅ **Mixed Connections**: KtrlPlane-managed resources + local connections  
✅ **No Breaking Changes**: Existing local connections continue to work

## Architecture

### Authentication Flow

1. **App Initialization**: `KtrlPlaneAuthProvider` wraps the entire app
2. **Silent Login**: Auth0 attempts token refresh on app load
3. **Resource Fetch**: When authenticated, app fetches Graph resources from KtrlPlane API
4. **Connection Merge**: KtrlPlane resources + local connections shown in selector
5. **Graph Access**: Uses separate token with `https://graph.konnektr.io` audience

### Components Modified

- **App.tsx**: Wrapped with `KtrlPlaneAuthProvider`
- **GraphHeader.tsx**: Real user data, login/logout UI, resource fetching
- **ConnectionSelector.tsx**: Shows KtrlPlane and local connections separately
- **connectionStore.ts**: Manages both KtrlPlane and local connections
- **proxy-backend/main.py**: Added KtrlPlane API proxy endpoint

### New Files Created

- **stores/authStore.ts**: User authentication state
- **services/ktrlplaneClient.ts**: KtrlPlane API client
- **components/KtrlPlaneAuthProvider.tsx**: Auth0 provider for platform auth
- **services/auth/tokenCredentialFactory.ts**: Added `KtrlPlaneGraphTokenCredential`
- **hooks/useDigitalTwinsClient.ts**: Helper hook for getting clients with Auth0 context

## Environment Variables

### Frontend (.env.development / .env.production)

```bash
# KtrlPlane Platform Authentication
VITE_KTRLPLANE_AUTH0_DOMAIN=auth.konnektr.io
VITE_KTRLPLANE_AUTH0_CLIENT_ID=your-client-id

# Legacy (connection-specific Auth0)
VITE_AUTH0_DOMAIN=auth.konnektr.io
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://api.graph.konnektr.io
```

### Backend (proxy-backend)

```bash
# KtrlPlane API base URL
KTRLPLANE_BASE_URL=https://api.ktrlplane.konnektr.io
```

## Backend API Requirements

### KtrlPlane API Endpoint Needed

**GET /api/v1/resources?resource_type=graph**

Returns all Graph resources the authenticated user has access to across all projects.

See `KTRLPLANE_API_REQUIREMENTS.md` for detailed implementation instructions.

## User Experience

### When Not Signed In

- User menu shows "Not signed in"
- Only local connections appear in connection selector
- Click user menu → "Sign in with KtrlPlane" to authenticate

### When Signed In

- User menu shows name/email
- Connection selector shows two sections:
  - **KtrlPlane Managed**: Resources from platform (top)
  - **Local Connections**: Manually added connections (bottom)
- KtrlPlane resources automatically use platform authentication

### Sign Out

- Click user menu → "Sign out"
- KtrlPlane resources removed from connection selector
- Local connections remain available

## Testing Checklist

- [ ] App loads without Auth0 config (graceful degradation)
- [ ] Silent login works on app load
- [ ] Manual login through user menu
- [ ] KtrlPlane resources appear after login
- [ ] Can connect to KtrlPlane-managed Graph instances
- [ ] Local connections still work
- [ ] Sign out clears KtrlPlane resources
- [ ] Can switch between KtrlPlane and local connections

## Migration Notes

### For Developers

1. Update `.env.development` with KtrlPlane Auth0 credentials
2. Ensure proxy backend is running (handles KtrlPlane API calls)
3. No code changes needed for existing local connections

### For Users

- No breaking changes
- Existing local connections continue to work
- Optional: Sign in to see KtrlPlane-managed resources
- Can mix and match KtrlPlane and local connections

## Next Steps

1. **KtrlPlane Backend**: Implement `GET /api/v1/resources` endpoint (see KTRLPLANE_API_REQUIREMENTS.md)
2. **Auth0 Configuration**: Set up Auth0 application with correct audiences
3. **Testing**: Verify resource fetching and authentication flows
4. **Documentation**: Update user-facing docs with sign-in instructions

## Troubleshooting

### "Failed to load KtrlPlane resources"

- Check browser console for specific error
- Verify Auth0 token has correct audience
- Ensure KtrlPlane API endpoint exists and returns valid data

### "Please sign in to access KtrlPlane resources"

- User needs to sign in via user menu
- Check that KtrlPlaneAuthProvider has valid configuration

### KtrlPlane resources not appearing

- Check that user has access to at least one Graph resource in KtrlPlane
- Verify token is being sent to KtrlPlane API
- Check proxy backend logs for API errors
