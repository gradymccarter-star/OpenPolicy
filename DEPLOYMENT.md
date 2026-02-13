# Deployment Guide

## Quick Setup (5 minutes)

### 1. Install Node.js
```bash
# macOS
brew install node

# Verify installation
node --version
npm --version
```

### 2. Install Dependencies
```bash
cd /Users/junnam/personal/SCAI
npm install
```

### 3. Set Up Supabase (FREE)
1. Go to https://supabase.com
2. Create account + new project
3. Go to Settings → Database → Connection String
4. Copy the URI connection string

### 4. Set Up Upstash Redis (FREE)
1. Go to https://upstash.com
2. Create account + new Redis database
3. Copy the Redis URL

### 5. Get Anthropic API Key (~$2 cost)
1. Go to https://console.anthropic.com
2. Create account
3. Add payment method
4. Set budget limit to $5
5. Create API key

### 6. Get ProPublica API Key (FREE)
1. Go to https://www.propublica.org/datastore/api/propublica-congress-api
2. Request free API key
3. Check your email

### 7. Create .env File
```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
REDIS_URL=redis://default:[PASSWORD]@[HOST]:[PORT]
ANTHROPIC_API_KEY=sk-ant-...
PROPUBLICA_API_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 8. Run Database Setup
```bash
npm run db:migrate
npm run db:seed
```

### 9. Fetch Data
```bash
npm run fetch:senators
node scripts/jobs/download-photos.js
```

### 10. Run Analysis (~$0.50-2.00)
```bash
npm run analyze
npm run calculate:scores
```

### 11. Start Development Server
```bash
npm run dev
```

Visit: http://localhost:3000

## Deploy to Vercel (FREE)

### Option 1: Via CLI
```bash
npm install -g vercel
vercel
```

### Option 2: Via GitHub
1. Push code to GitHub
2. Go to vercel.com
3. Import repository
4. Add environment variables
5. Deploy!

## Post-Deployment

### Weekly Updates (Optional)
Set up cron job or GitHub Actions:
```bash
npm run batch:run
```

### Monitor Costs
- Check Anthropic console: https://console.anthropic.com
- Budget should stay under $5/month

## Troubleshooting

### Database Connection Error
- Verify DATABASE_URL is correct
- Check Supabase project is running

### Redis Connection Error
- Verify REDIS_URL is correct
- Check Upstash database is active

### API Cost Too High
- Check `api_usage_log` table
- Reduce analysis frequency
- Use Haiku model only

### Photos Not Loading
- Run `node scripts/jobs/download-photos.js` again
- Check `/public/photos` directory exists

## Success Metrics

✅ Database has 30 politicians
✅ AI analyses completed (<$2 cost)
✅ Scores calculated
✅ Homepage loads with top politicians
✅ Individual politician pages work
✅ Total deployment time: <2 hours
