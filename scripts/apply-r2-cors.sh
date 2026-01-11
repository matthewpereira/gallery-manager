#!/bin/bash

# Script to apply CORS configuration to R2 bucket
# Usage: ./scripts/apply-r2-cors.sh [dev|prod]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔧 R2 CORS Configuration Tool${NC}\n"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Error: Wrangler CLI is not installed${NC}"
    echo -e "Install it with: npm install -g wrangler"
    exit 1
fi

# Determine which config to use
ENV=${1:-dev}
if [ "$ENV" = "prod" ]; then
    CONFIG_FILE="config/r2-cors-production.json"
    echo -e "${YELLOW}Using production CORS config (restricted to specific domains)${NC}"
else
    CONFIG_FILE="config/r2-cors.json"
    echo -e "${YELLOW}Using development CORS config (allows all origins)${NC}"
fi

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ Error: Config file not found: $CONFIG_FILE${NC}"
    exit 1
fi

# Load bucket name from .env
if [ -f ".env.development" ]; then
    export $(grep VITE_R2_BUCKET_NAME .env.development | xargs)
fi

if [ -z "$VITE_R2_BUCKET_NAME" ]; then
    echo -e "${RED}❌ Error: VITE_R2_BUCKET_NAME not found in .env.development${NC}"
    exit 1
fi

BUCKET_NAME=$VITE_R2_BUCKET_NAME

echo -e "Bucket: ${GREEN}$BUCKET_NAME${NC}"
echo -e "Config: ${GREEN}$CONFIG_FILE${NC}\n"

# Show the CORS config that will be applied
echo -e "${YELLOW}CORS configuration to apply:${NC}"
cat "$CONFIG_FILE"
echo ""

# Ask for confirmation
read -p "Apply this CORS configuration to bucket '$BUCKET_NAME'? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 1
fi

# Apply CORS configuration
echo -e "\n${GREEN}Applying CORS configuration...${NC}"
wrangler r2 bucket cors put "$BUCKET_NAME" --cors-file "$CONFIG_FILE"

echo -e "\n${GREEN}✓ CORS configuration applied successfully!${NC}\n"

# Verify
echo -e "${GREEN}Verifying CORS configuration:${NC}"
wrangler r2 bucket cors get "$BUCKET_NAME"

echo -e "\n${GREEN}✓ Done!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "  1. Clear your browser cache or use incognito mode"
echo -e "  2. Refresh your app"
echo -e "  3. The OpaqueResponseBlocking errors should be gone\n"
