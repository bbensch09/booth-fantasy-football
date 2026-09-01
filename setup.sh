#!/usr/bin/env bash
# Booth local setup helper. Run once after cloning.
# Usage: bash setup.sh

set -e

echo "==> Installing dependencies"
npm install

# -------------------------------------------------------
# Option A: local Supabase (needs Docker)
# -------------------------------------------------------
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  echo ""
  echo "==> Docker found. Starting local Supabase (this takes a minute the first time)"
  npx supabase start

  # grab the auto-generated local credentials
  STATUS=$(npx supabase status --output json 2>/dev/null || echo "{}")
  API_URL=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('API URL','http://localhost:54321'))" 2>/dev/null || echo "http://localhost:54321")
  ANON_KEY=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('anon key',''))" 2>/dev/null || echo "")
  SERVICE_KEY=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('service_role key',''))" 2>/dev/null || echo "")

  cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY

# Optional — inference for "Ask Booth"
BOOTH_LLM_API_KEY=
BOOTH_LLM_BASE_URL=https://api.fireworks.ai/inference/v1
BOOTH_LLM_MODEL=accounts/fireworks/models/llama-v3p3-70b-instruct

# Optional — email digests (Resend free tier)
RESEND_API_KEY=
BOOTH_FROM_EMAIL=booth@yourdomain.com

# Optional — cron jobs
CRON_SECRET=$(openssl rand -hex 16)
EOF

  echo ""
  echo "==> .env.local written with local Supabase credentials"
  echo "==> Starting dev server..."
  npm run dev

else
  # -------------------------------------------------------
  # Option B: cloud Supabase (no Docker)
  # -------------------------------------------------------
  echo ""
  echo "Docker not found (or not running). Using cloud Supabase instead."
  echo ""
  echo "Quick steps to get your credentials:"
  echo "  1. Go to https://supabase.com → New project"
  echo "  2. Project settings → API → copy Project URL, anon key, service_role key"
  echo "  3. Go to Authentication → Providers → Email → enable magic links"
  echo "  4. SQL editor → paste supabase/schema.sql → Run"
  echo "  5. Paste the three values when prompted below"
  echo ""

  read -rp "Project URL (e.g. https://xyz.supabase.co): " SUPABASE_URL
  read -rp "Anon key: " ANON_KEY
  read -rp "Service role key: " SERVICE_KEY

  cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY

# Optional — inference for "Ask Booth"
BOOTH_LLM_API_KEY=
BOOTH_LLM_BASE_URL=https://api.fireworks.ai/inference/v1
BOOTH_LLM_MODEL=accounts/fireworks/models/llama-v3p3-70b-instruct

# Optional — email digests (Resend free tier)
RESEND_API_KEY=
BOOTH_FROM_EMAIL=booth@yourdomain.com

# Optional — cron jobs
CRON_SECRET=$(openssl rand -hex 16)
EOF

  echo ""
  echo "==> .env.local written"
  echo "==> Starting dev server..."
  npm run dev
fi
