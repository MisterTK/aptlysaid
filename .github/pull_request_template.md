## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

<!-- Mark the relevant option with an "x" -->

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 Style/UI update
- [ ] ♻️ Code refactor
- [ ] ⚡ Performance improvement
- [ ] 🔧 Configuration change
- [ ] 🗃️ Database migration

## Checklist

<!-- Mark completed items with an "x" -->

### Code Quality

- [ ] I have run `npm run validate` locally and all checks pass
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings

### Testing

- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] I have tested my changes in a local environment

### Database Changes (if applicable)

- [ ] I have created necessary migration files in `supabase/migrations/`
- [ ] Migrations have been tested locally with `supabase db push --local`
- [ ] I have updated database types with `supabase gen types typescript --local`
- [ ] Rollback strategy has been considered and documented

### Documentation

- [ ] I have updated the documentation accordingly
- [ ] I have updated the README if needed
- [ ] I have added/updated JSDoc comments for new functions

### Deployment Readiness

- [ ] Environment variables have been documented if new ones are added
- [ ] Changes are backward compatible
- [ ] Feature flags are implemented for gradual rollout (if needed)
- [ ] I have considered the impact on production data

## Preview Deployment

<!-- These will be automatically added by GitHub Actions -->

- 🚀 Vercel Preview: <!-- URL will be added by bot -->
- 🗄️ Supabase Branch: <!-- Branch name will be added by bot -->

## Testing Instructions

<!-- Provide step-by-step instructions for testing your changes -->

1.
2.
3.

## Screenshots (if applicable)

<!-- Add screenshots to help explain your changes -->

## Related Issues

<!-- Link any related issues -->

Closes #

## Additional Notes

<!-- Any additional information that reviewers should know -->

## Post-Merge Actions

<!-- List any manual steps needed after merging -->

- [ ] No additional actions required
- [ ] Update environment variables in Vercel
- [ ] Run manual migration script
- [ ] Update external service configurations
- [ ] Notify team about breaking changes

---

### GitOps Compliance

This PR follows our GitOps workflow:

- [ ] All changes are version controlled
- [ ] CI/CD pipeline will handle deployments
- [ ] No manual production changes required
- [ ] Rollback is possible through Git revert
