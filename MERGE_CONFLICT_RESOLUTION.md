# Merge Conflict Resolution Guide

## Situation

The PR #6 (`copilot/fix-mapbox-rendering-issue`) has merge conflicts with the `main` branch because:

1. **Base Branch**: Our branch was created from commit `25e2ae74` (old main)
2. **Current Main**: Main branch is now at commit `dd5c952b` (after merging PR #3)
3. **Conflicting Files**: Both branches modified:
   - `api/getConfig/index.js`
   - `app.js`
   - `api/package.json`
   - Documentation files (README.md, CONFIGURATION.md)

## What PR #3 (`copilot/add-env-variables-readme`) Did

PR #3 was merged into main and implemented:
- Created `api/getConfig/index.js` with MAPBOX_TOKEN environment variable support
- Modified `app.js` to load config from the API
- Updated documentation
- Fixed package.json issues

## What Our PR #6 Did

Our branch independently implemented:
- Created `api/getConfig/index.js` with similar functionality
- Modified `app.js` to load config from the API  
- Updated documentation
- Fixed package.json issues
- Updated GitHub Actions workflow

## Resolution Steps

### Option 1: Manual Merge (Recommended)

Since both branches implemented the same feature, you need to:

1. **Fetch latest main branch**:
   ```bash
   git fetch origin main
   git checkout copilot/fix-mapbox-rendering-issue
   git merge origin/main
   ```

2. **Resolve conflicts**:
   The files will have conflict markers. For each conflicting file:
   
   **For `api/getConfig/index.js`**:
   - Both versions are similar
   - Choose the version from main (PR #3) as it went through review
   - Or manually merge improvements from both

   **For `app.js`**:
   - Both modified the same functions
   - Choose the version from main (PR #3) as it went through review
   - Ensure loadConfig() function exists and is called in init()

   **For documentation files**:
   - Merge the best parts from both versions
   - Ensure consistency in instructions

3. **Test the merged code**:
   ```bash
   cd api && npm install
   # Test that the application works
   ```

4. **Commit the merge**:
   ```bash
   git add .
   git commit -m "Merge main into copilot/fix-mapbox-rendering-issue"
   git push origin copilot/fix-mapbox-rendering-issue
   ```

### Option 2: Rebase (Alternative)

```bash
git fetch origin main
git checkout copilot/fix-mapbox-rendering-issue
git rebase origin/main
# Resolve conflicts as they appear
git push --force origin copilot/fix-mapbox-rendering-issue
```

### Option 3: Close This PR

Since PR #3 already implemented the MAPBOX_TOKEN environment variable feature:
- Close this PR #6
- The feature is already in main
- No additional work needed

## Key Differences to Preserve

If you choose to merge, ensure these unique improvements from our branch are preserved:

1. **GitHub Actions Workflow Update**:
   - We updated `.github/workflows/azure-static-web-apps-zealous-pond-09cbfb91e.yml`
   - Changed `api_location: ""` to `api_location: "api"`
   - This ensures Azure Functions are properly deployed

2. **Documentation Improvements**:
   - May have slightly different wording or additional details
   - Review and merge the best parts

## Current PR Status

- **Mergeable**: `false`
- **Mergeable State**: `dirty` (has conflicts)
- **Rebaseable**: `false`
- **Commits**: 3 (Initial plan, Implement MAPBOX_TOKEN, Remove devDependency)
- **Files Changed**: 6

## Recommendation

**Since PR #3 is already merged and implements the same feature, I recommend Option 3: Close this PR.**

The functionality you requested (MAPBOX_TOKEN environment variable) is already implemented in the main branch. You can verify by:

1. Checking out main branch
2. Looking at `api/getConfig/index.js` - it exists and reads `process.env.MAPBOX_TOKEN`
3. Looking at `app.js` - it has `loadConfig()` function
4. Setting up `MAPBOX_TOKEN` in Azure Static Web App Configuration

The only unique contribution from our branch is the workflow file update (`api_location: "api"`), which you can cherry-pick if needed:

```bash
git checkout main
git cherry-pick a940086  # or the commit with workflow changes
```
