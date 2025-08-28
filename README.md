# AptlySaid - AI-Powered Review Management Platform

A multi-tenant SaaS application for managing Google My Business reviews with AI-powered response generation.

## 🏗️ Architecture

- **Frontend**: SvelteKit + TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI**: OpenAI GPT / Google Vertex AI
- **Payments**: Stripe
- **Deployment**: Vercel (Frontend) + Supabase (Backend)
- **CI/CD**: GitHub Actions with GitOps

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Supabase CLI
- GitHub account
- Vercel account
- Supabase account (only ONE project needed!)

### Local Development

1. **Clone the repository**

   ```bash
   git clone https://github.com/MisterTK/aptlysaid.git
   cd aptlysaid
   npm install
   ```

2. **Start Supabase locally**

   ```bash
   supabase start
   ```

3. **Copy environment variables**

   ```bash
   cp .env.example .env.local
   # Add your local Supabase URL and anon key from supabase start output
   ```

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Open http://localhost:5173**

## 🎯 Deployment Strategy

This project uses **Supabase Branching** - one production project with automatic preview branches:

```
main branch → Production (efujvtdywpkajwbkmaoi.supabase.co)
develop branch → Preview Branch (auto-created)
feature/* → Feature Branches (auto-created)
```

### Benefits:

- ✅ Single Supabase project
- ✅ Automatic preview environments
- ✅ Isolated databases per branch
- ✅ Zero configuration

## 📦 Project Structure

```
aptlysaid/
├── src/                    # SvelteKit application
│   ├── routes/            # Pages and API routes
│   ├── lib/               # Shared components and utilities
│   └── app.html           # HTML template
├── supabase/              # Supabase configuration
│   ├── migrations/        # Database migrations
│   ├── functions/         # Edge functions
│   └── seed.sql          # Seed data
├── .github/workflows/     # GitHub Actions
└── docs/                  # Documentation
```

## 🔧 Configuration

### Required GitHub Secrets

Set these in your repository settings:

```yaml
SUPABASE_ACCESS_TOKEN       # From supabase.com/dashboard/account/tokens
SUPABASE_PROJECT_ID         # Your production project ID
SUPABASE_DB_PASSWORD        # Database password
SUPABASE_SERVICE_ROLE_KEY   # Service role key

# External services
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
OPENAI_API_KEY
SENDGRID_API_KEY
ENCRYPTION_KEY              # Generate with: openssl rand -hex 16
```

### One-Time Setup

1. **Enable GitHub Integration in Supabase**

   - Dashboard → Settings → Integrations → GitHub
   - Enable branching

2. **Configure Vercel**

   - Import repository
   - Install Supabase integration
   - Auto-deploys configured

3. **Set up Auth Providers**

   - Enable Google OAuth in Supabase Dashboard
   - Configure redirect URLs

4. **Configure Stripe Webhooks**
   - Endpoint: `https://YOUR_PROJECT.supabase.co/functions/v1/v2-api/stripe/webhook`

## 🚢 Deployment

### Automatic Deployments

- **Push to `main`** → Production deployment
- **Push to `develop`** → Preview deployment
- **Open PR** → Feature branch deployment

### Manual Deployment

```bash
# Deploy to production
git push origin main

# Deploy to preview
git push origin develop
```

## 📊 Features

### For Users

- 📝 Automated review response generation
- 🤖 AI-powered tone and style customization
- 📈 Review analytics dashboard
- 👥 Team collaboration
- 📱 Mobile-responsive design

### For Developers

- 🔄 GitOps workflow
- 🔐 Secure secrets management
- ⚡ Edge functions for API
- 📅 Automated cron jobs
- 🔍 Full observability

## 🛠️ Development

### Database Migrations

```bash
# Create new migration
supabase migration new your_migration_name

# Apply migrations locally
supabase db reset

# Migrations auto-deploy on push
```

### Edge Functions

```bash
# Develop locally
supabase functions serve function-name

# Functions auto-deploy on push to main
```

### Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Type checking
npm run check
```

## 📚 Documentation

- [Supabase Branching Setup](docs/SUPABASE-BRANCHING-SETUP.md)
- [GitOps Guide](docs/aptlysaid_gitops_guide.md)
- [One-Time Setup](docs/ONE-TIME-SETUP.md)
- [GitHub Secrets Required](docs/github-secrets-required.md)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch from `develop`
3. Make your changes
4. Open PR to `develop`
5. After review, merge to `develop`
6. Periodically, `develop` is merged to `main`

## 📄 License

[Your License]

## 🆘 Support

- GitHub Issues: [Report bugs](https://github.com/YOUR_USERNAME/aptlysaid/issues)
- Documentation: [Read the docs](./docs)

---

Built with ❤️ using SvelteKit, Supabase, and AI
