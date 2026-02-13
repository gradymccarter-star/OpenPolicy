# Political AI Alignment Evaluator (SCAI)

A transparent, data-driven platform that evaluates US politicians' alignment with OECD AI principles.

## 🚀 Hackathon MVP Features

- **30 High-Profile US Senators** evaluated against 5 OECD AI principles
- **Claude Haiku-powered analysis** with full transparency
- **Cost-optimized**: <$10 total budget (~$0.50-2.00 AI costs)
- **Free infrastructure**: Vercel + Supabase + Upstash
- **Minimalist UI**: Clean, fast, mobile-responsive

## 🏗️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL (Supabase Free Tier)
- **Cache**: Redis (Upstash Free Tier)
- **AI**: Claude Haiku API (Anthropic)
- **Deployment**: Vercel (Free Hobby Plan)

## 📦 Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run database migrations
npm run db:migrate

# Seed OECD principles
npm run db:seed

# Fetch senator data
npm run fetch:senators

# Run AI analysis
npm run analyze

# Calculate scores
npm run calculate:scores

# Start development server
npm run dev
```

## 🔑 Required API Keys

1. **Supabase** (FREE): https://supabase.com
   - Create project, get `DATABASE_URL`

2. **Upstash** (FREE): https://upstash.com
   - Create Redis database, get `REDIS_URL`

3. **Anthropic** (~$2): https://console.anthropic.com
   - Get API key, set budget limit to $5

4. **ProPublica** (FREE): https://www.propublica.org/datastore/api/propublica-congress-api
   - Request free API key

## 📊 Data Pipeline

```bash
# Run full batch processing
npm run batch:run

# Or run individual jobs
npm run fetch:senators    # Fetch 30 senators from ProPublica
npm run fetch:votes       # Fetch AI-related voting records
npm run fetch:statements  # Scrape official websites
npm run analyze           # Run Claude AI analysis
npm run calculate:scores  # Aggregate scores and rankings
```

## 🎯 OECD AI Principles

1. **Inclusive Growth, Sustainable Development & Well-being**
2. **Human-Centered Values & Fairness**
3. **Transparency & Explainability**
4. **Robustness, Security & Safety**
5. **Accountability**

## 🧮 Scoring Methodology

- **Individual Item Score**: 0-1 scale from Claude analysis
- **Principle Score**: Weighted average of all analyses (recent = higher weight)
- **Overall Score**: Equal-weighted average of 5 principle scores
- **Confidence Level**: Displayed alongside all scores

## 📁 Project Structure

```
/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Homepage dashboard
│   ├── politicians/       # Politician pages
│   ├── principles/        # Principles overview
│   ├── about/             # Methodology page
│   └── api/               # API routes
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── politicians/      # Politician components
│   └── scores/           # Score visualizations
├── lib/                   # Core logic
│   ├── db/               # Database client
│   ├── cache/            # Redis cache
│   ├── ai/               # Claude API client
│   ├── data-sources/     # External APIs
│   └── scoring/          # Score calculation
├── scripts/               # Batch processing
│   ├── jobs/             # Individual jobs
│   └── orchestrator.ts   # Cron coordinator
└── public/                # Static files
```

## 💰 Cost Breakdown

### Hackathon MVP (<$10)
- Infrastructure: **$0** (free tiers)
- Claude API: **~$0.50-2.00** (one-time)
- **Total: <$2.00**

### Monthly (Post-Hackathon)
- Infrastructure: **$0** (still free)
- Claude API: **~$5/month** (weekly updates)
- **Total: ~$5/month**

## 🚢 Deployment

```bash
# Deploy to Vercel
vercel

# Or connect GitHub repo for auto-deploy
# Push to main branch → auto-deploy
```

## 📝 License

MIT

## 🤝 Contributing

This is a hackathon project. Contributions welcome!

## ⚠️ Disclaimer

**For informational purposes only.** AI-generated scores are based on public data and computational analysis. Always verify with primary sources.
