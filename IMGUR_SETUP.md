# Imgur OAuth Setup Guide

## Overview

This app uses **two separate Imgur applications** to support both development and production environments, since Imgur only allows one callback URL per application.

---

## 🏭 Production App (Already Configured)

**Purpose:** Used on GitHub Pages deployment

**Settings:**
- **Client ID:** `5df669f33464fd3`
- **Callback URL:** `https://matthewpereira.github.io/gallery-manager/auth/callback`
- **Environment file:** `.env.production`

**Status:** ✅ Already set up

---

## 💻 Development App (You Need to Create This)

### Step 1: Register New Imgur Application

1. Go to: **https://api.imgur.com/oauth2/addclient**

2. Fill out the form:
   - **Application name:** `Gallery Manager (Dev)`
   - **Authorization type:** ☑️ **OAuth 2 authorization with a callback URL**
   - **Authorization callback URL:** `http://localhost:5173/auth/callback`
   - **Email:** Your email address
   - **Description:** `Development version of Gallery Manager`

3. Click **Submit**

4. You'll receive:
   - **Client ID** (something like `abc123def456`)
   - **Client Secret** (something like `xyz789uvw012`)

### Step 2: Update `.env.development`

Open `.env.development` and replace the placeholder values:

```bash
VITE_IMGUR_CLIENT_ID=abc123def456        # ← Your DEV client ID
VITE_IMGUR_CLIENT_SECRET=xyz789uvw012    # ← Your DEV client secret
VITE_IMGUR_REDIRECT_URI=http://localhost:5173/auth/callback
```

### Step 3: Test It

```bash
npm run dev
```

- Open http://localhost:5173
- Log in with Auth0
- Click "Connect Imgur"
- You should be redirected to Imgur's authorization page
- After approving, you'll be redirected back to `http://localhost:5173/auth/callback`
- The app should now have access to your Imgur account

---

## 🔄 How Vite Environment Files Work

Vite automatically loads the correct environment file based on the mode:

| Command | Environment File Loaded | Used For |
|---------|------------------------|----------|
| `npm run dev` | `.env.development` | Local development |
| `npm run build` | `.env.production` | GitHub Pages deployment |
| `npm run preview` | `.env.production` | Preview production build locally |

**Priority order:** `.env.[mode]` > `.env` > system environment variables

---

## 📁 Environment Files in This Project

```
.env                  # Base/fallback - contains production credentials
.env.development      # Dev-only - YOU NEED TO UPDATE THIS with dev app credentials
.env.production       # Production-only - already configured
.env.local            # Local overrides (gitignored, optional)
```

---

## 🔐 Security Notes

**Important:**
- `.env` is currently **committed to git** (contains production credentials)
- `.env.local` is **gitignored** (safe for secrets)
- `.env.development` is **gitignored** (your dev credentials are safe)
- `.env.production` is **gitignored** (contains production credentials)

**Recommendation:**
For open-source projects, you should:
1. Remove `.env` from git (add it to `.gitignore`)
2. Create `.env.example` with placeholder values
3. Store real credentials in environment variables or secrets manager

---

## 🐛 Troubleshooting

### "Imgur is temporarily over capacity" (403 error)

This is Imgur's generic block message, usually means:
- ✅ **Fixed by using separate dev app** - You won't hit the production app's rate limits
- IP/region blocking - Try a VPN or wait 24 hours
- Callback URL mismatch - Make sure it matches exactly in Imgur settings

### "redirect_uri_mismatch" error

- Check that your callback URL in Imgur settings **exactly matches** what's in `.env.development`
- URL must include protocol: `http://` (not `https://` for localhost)
- No trailing slashes: `http://localhost:5173/auth/callback` ✅ (not `/auth/callback/` ❌)

### Token not persisting

The Imgur token is stored in `localStorage` with key `imgur_auth_token`. Check:
- Browser DevTools → Application → Local Storage → `http://localhost:5173`
- Look for the `imgur_auth_token` key
- If missing, the OAuth flow didn't complete successfully

### Can't find "Add Application" button

The button doesn't exist - you must use the direct link:
**https://api.imgur.com/oauth2/addclient**

---

## 📊 Managing Multiple Imgur Apps

View your registered apps at:
**https://imgur.com/account/settings/apps**

You should see two apps:
1. **Gallery Manager** (production) - callback: `https://matthewpereira.github.io/...`
2. **Gallery Manager (Dev)** - callback: `http://localhost:5173/...`

You can delete or regenerate credentials from this page if needed.

---

## 🚀 Quick Start Checklist

- [ ] Create dev Imgur app at https://api.imgur.com/oauth2/addclient
- [ ] Copy Client ID and Client Secret
- [ ] Update `.env.development` with your dev credentials
- [ ] Run `npm run dev`
- [ ] Test OAuth flow by clicking "Connect Imgur"
- [ ] Verify token appears in localStorage

---

## 🔗 Useful Links

- **Register new Imgur app:** https://api.imgur.com/oauth2/addclient
- **Manage your apps:** https://imgur.com/account/settings/apps
- **Imgur API docs:** https://apidocs.imgur.com/
- **OAuth 2.0 guide:** https://api.imgur.com/oauth2

---

**Need help?** Check the console logs when clicking "Connect Imgur" - the auth URL will be logged with all parameters.
