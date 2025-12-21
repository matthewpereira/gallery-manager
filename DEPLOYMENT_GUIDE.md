# Deployment Guide - Gallery Manager

## 🎯 Current Setup (December 2024)

### Branch Structure
- ✅ **main** - Single source of truth for all code
- ✅ **origin/main** - Remote branch on GitHub
- ❌ ~~gh-pages~~ - Deleted (no longer needed)

### Deployment Method
**GitHub Actions** automatically deploys to GitHub Pages when you push to main.

---

## 🚀 How Deployment Works

### Automatic Deployment

Every time you push to `main`, GitHub Actions:

1. ✅ Checks out your code
2. ✅ Installs dependencies (`npm ci`)
3. ✅ Builds the project (`npm run build`)
4. ✅ Deploys to GitHub Pages
5. ✅ Available at: **https://matthewpereira.github.io/gallery-manager**

### Deployment Workflow File
Location: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

```yaml
on:
  push:
    branches: [ main ]  # Triggers on push to main
  workflow_dispatch:    # Can also trigger manually
```

---

## 📝 How to Deploy Changes

### Simple Workflow:

```bash
# 1. Make your changes
# 2. Test locally
npm run dev

# 3. Build to verify no errors
npm run build

# 4. Commit your changes
git add .
git commit -m "Your commit message"

# 5. Push to main (triggers automatic deployment)
git push origin main

# 6. Check deployment status
# Visit: https://github.com/matthewpereira/gallery-manager/actions
```

That's it! GitHub Actions handles the rest automatically.

---

## 🔐 Required GitHub Secrets

Your deployment workflow needs these secrets configured in GitHub:

**Location:** GitHub Repository → Settings → Secrets and variables → Actions

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `VITE_IMGUR_CLIENT_ID` | `5df669f33464fd3` | Imgur app client ID |
| `VITE_IMGUR_CLIENT_SECRET` | `698fe68c5d0728461954043a62abf25a19745b19` | Imgur app secret |
| `VITE_IMGUR_REDIRECT_URI` | `https://matthewpereira.github.io/gallery-manager` | OAuth callback URL |

**To add/update secrets:**
1. Go to https://github.com/matthewpereira/gallery-manager/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret with its value

---

## 🌍 Environment Configuration

### Production (.env.production)
Used when building for deployment:
```bash
VITE_IMGUR_CLIENT_ID=5df669f33464fd3
VITE_IMGUR_CLIENT_SECRET=698fe68c5d0728461954043a62abf25a19745b19
VITE_IMGUR_REDIRECT_URI=https://matthewpereira.github.io/gallery-manager
```

### Development (.env.development)
Used when running `npm run dev` locally:
```bash
VITE_IMGUR_CLIENT_ID=your_dev_client_id_here
VITE_IMGUR_CLIENT_SECRET=your_dev_client_secret_here
VITE_IMGUR_REDIRECT_URI=http://localhost:5173
```

**Note:** Create a separate Imgur app for development. See [IMGUR_SETUP.md](IMGUR_SETUP.md)

---

## 🔍 Monitoring Deployments

### Check Deployment Status

1. **GitHub Actions Page:**
   ```
   https://github.com/matthewpereira/gallery-manager/actions
   ```

2. **Look for:**
   - ✅ Green checkmark = deployment succeeded
   - ❌ Red X = deployment failed
   - 🟡 Yellow circle = deployment in progress

3. **View Logs:**
   - Click on the workflow run
   - Click on "build" or "deploy" job
   - Expand steps to see detailed logs

### Deployment Time
- ⏱️ Typically takes 2-3 minutes from push to live

---

## 🐛 Troubleshooting

### Deployment Failed

**1. Check the error in GitHub Actions:**
```
GitHub → Actions → Click on failed workflow → View logs
```

**2. Common issues:**

| Error | Solution |
|-------|----------|
| Build failed | Run `npm run build` locally to see the error |
| Missing secrets | Add required secrets in GitHub settings |
| Type errors | Fix TypeScript errors shown in logs |
| Node version mismatch | Update Node.js in workflow file |

**3. Test locally before pushing:**
```bash
# Always test the build before deploying
npm run build

# Preview the production build
npm run preview
```

### Build Works Locally But Fails in GitHub Actions

**Possible causes:**
- Environment variables not set in GitHub Secrets
- Missing files in `.gitignore`
- Node version mismatch (workflow uses Node 18)
- Case-sensitive imports (macOS is case-insensitive, Linux is not)

**Solution:**
```bash
# Ensure all environment variables are in GitHub Secrets
# Check for case sensitivity in imports:
grep -r "import.*tsx" src/ | grep -v ".tsx"
```

### Site Not Updating

**1. Clear browser cache:**
```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

**2. Check deployment completed:**
- Visit GitHub Actions to confirm deployment succeeded
- Check the timestamp matches your latest push

**3. GitHub Pages settings:**
```
GitHub → Settings → Pages
Ensure: Source = "GitHub Actions"
```

---

## 📦 Manual Deployment (Emergency Only)

If GitHub Actions is down, you can deploy manually:

```bash
# 1. Build the project
npm run build

# 2. Use gh-pages package (already installed)
npx gh-pages -d dist

# This creates/updates a gh-pages branch with built files
# But normally, let GitHub Actions handle this!
```

**Note:** After manual deployment, switch back to automatic deployments by pushing to main.

---

## 🔄 Rollback a Deployment

If you deployed broken code:

### Option 1: Revert the Commit
```bash
# Find the last good commit
git log --oneline

# Revert to that commit
git revert <commit-hash>

# Push (triggers new deployment)
git push origin main
```

### Option 2: Force Push Previous Version
```bash
# DANGER: This rewrites history
git reset --hard <good-commit-hash>
git push --force origin main
```

**⚠️ Option 2 is dangerous** - only use if absolutely necessary!

---

## 📊 Deployment Checklist

Before deploying major changes:

- [ ] ✅ Code builds without errors (`npm run build`)
- [ ] ✅ Tests pass (if you have them)
- [ ] ✅ Imgur OAuth still works with updated callback URL
- [ ] ✅ Environment variables are correct
- [ ] ✅ No sensitive data in code (check `.env` is gitignored)
- [ ] ✅ Updated CHANGELOG or documentation if needed
- [ ] ✅ Committed with clear commit message

---

## 🎓 Best Practices

### Commit Messages
```bash
# Good
git commit -m "Add S3 storage provider adapter"
git commit -m "Fix OAuth redirect URL for production"
git commit -m "Update album grid to use normalized models"

# Bad
git commit -m "fix"
git commit -m "update"
git commit -m "asdf"
```

### Branching Strategy
```bash
# For features, create a feature branch
git checkout -b feature/add-s3-provider

# Work on feature
# ...

# When ready, merge to main
git checkout main
git merge feature/add-s3-provider
git push origin main

# Delete feature branch
git branch -d feature/add-s3-provider
```

### Testing Before Deploy
```bash
# Always test production build locally
npm run build
npm run preview

# Open http://localhost:4173 to test
```

---

## 🔗 Useful Links

- **Live Site:** https://matthewpereira.github.io/gallery-manager
- **GitHub Repo:** https://github.com/matthewpereira/gallery-manager
- **GitHub Actions:** https://github.com/matthewpereira/gallery-manager/actions
- **GitHub Pages Settings:** https://github.com/matthewpereira/gallery-manager/settings/pages
- **Secrets Settings:** https://github.com/matthewpereira/gallery-manager/settings/secrets/actions

---

## 📚 Related Documentation

- [STORAGE_PROVIDER_GUIDE.md](STORAGE_PROVIDER_GUIDE.md) - How to add new storage providers
- [IMGUR_SETUP.md](IMGUR_SETUP.md) - Setting up Imgur OAuth
- [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) - What was changed in the refactoring

---

**Questions?** Check the GitHub Actions logs or review the workflow file at [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
