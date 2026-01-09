# Pull Request Preview Deployments

## Overview

This repository is configured to automatically deploy preview environments for every pull request using Azure Static Web Apps. This allows reviewers to test changes in a live environment before merging to production.

## How It Works

### Automatic Preview Creation

When you create or update a pull request:

1. **Workflow Trigger**: The Azure Static Web Apps CI/CD workflow automatically triggers
2. **Build & Deploy**: Your changes are built and deployed to a unique staging environment
3. **Preview URL**: Azure posts a comment on the PR with the preview URL (e.g., `https://zealous-pond-09cbfb91e-<pr-number>.centralus.5.azurestaticapps.net`)
4. **Live Testing**: You and reviewers can test the changes in the preview environment

### Preview Updates

- **Automatic Updates**: Every time you push new commits to the PR branch, the preview environment is automatically updated
- **Real-time Sync**: The preview URL stays the same, making it easy to share with reviewers

### Preview Cleanup

When a pull request is closed or merged:

1. **Automatic Cleanup**: The staging environment is automatically deleted
2. **Resource Management**: This ensures no orphaned preview environments consume Azure resources

## Workflow Configuration

The preview deployment feature is configured in the workflow file:

### Workflow: `.github/workflows/azure-static-web-apps.yml`

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - main
      - master

permissions:
  contents: read
  pull-requests: write  # Required to post preview URL comments

jobs:
  build_and_deploy_job:
    # Runs on PR open/update
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    # ... build and deploy steps ...
  
  close_pull_request_job:
    # Runs on PR close/merge
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    # ... cleanup steps ...
```

### Key Features

- **PR Triggers**: `opened`, `synchronize`, `reopened`, `closed`
- **GitHub Token**: `repo_token: ${{ secrets.GITHUB_TOKEN }}` enables PR comment integration
- **Permissions**: `pull-requests: write` allows Azure to post preview URLs as comments

## Using Preview Environments

### For PR Authors

1. Create a pull request
2. Wait for the workflow to complete (typically 1-3 minutes)
3. Azure will post a comment with the preview URL
4. Share the preview URL with reviewers or test it yourself
5. Push updates to automatically refresh the preview

### For Reviewers

1. Click the preview URL in the PR comments
2. Test the changes in the live environment
3. Verify functionality works as expected
4. Leave feedback on the PR

## Example Preview URL

```
🚀 Preview environment deployed!
URL: https://zealous-pond-09cbfb91e-23.centralus.5.azurestaticapps.net
```

## Benefits

- **Early Testing**: Catch issues before merging to production
- **Visual Review**: See UI changes without running the code locally
- **Collaboration**: Share a live URL with stakeholders
- **Confidence**: Verify changes work in a production-like environment
- **Zero Configuration**: Works automatically for every PR

## Technical Details

### Azure Static Web Apps Staging

- Each PR gets a unique subdomain based on the PR number
- The staging environment mirrors production configuration
- Environment variables and secrets are inherited from Azure
- API functions are also deployed and tested

### Workflow Secrets

The workflow uses these secrets:
- `AZURE_STATIC_WEB_APPS_API_TOKEN`: Azure deployment token for the static web app
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions for PR comments

## Troubleshooting

### Preview Not Deployed

If the preview environment doesn't deploy:

1. Check the Actions tab for workflow errors
2. Verify Azure Static Web Apps secrets are configured
3. Ensure the PR targets the `main` or `master` branch
4. Check that the workflow files are present in `.github/workflows/`

### Preview URL Not Posted

If the workflow succeeds but no comment appears:

1. Verify `pull-requests: write` permission is set
2. Check that `repo_token: ${{ secrets.GITHUB_TOKEN }}` is configured
3. Look for the preview URL in the workflow logs under "Build and Deploy" step

## Additional Resources

- [Azure Static Web Apps Documentation](https://docs.microsoft.com/azure/static-web-apps/)
- [Staging Environments](https://docs.microsoft.com/azure/static-web-apps/review-publish-pull-requests)
- [GitHub Actions for Static Web Apps](https://github.com/Azure/static-web-apps-deploy)
