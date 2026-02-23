#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Deploying Shipment Tracker API with Docker..."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Error: .env file is missing. Please create it with your environment variables."
  echo "It should contain NODE_ENV, PORT, and MONGO_URI."
  exit 1
fi

# Build and start containers
docker-compose up -d --build

# Check if containers are running
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Shipment Tracker API is now running!${NC}"
  echo -e "${GREEN}📊 API is available at: http://localhost:8899${NC}"
  echo -e "${YELLOW}📝 To view logs: docker-compose logs -f${NC}"
  echo -e "${YELLOW}🛑 To stop: docker-compose down${NC}"
else
  echo -e "${RED}❌ Failed to start containers. Check the logs for more information.${NC}"
  exit 1
fi 