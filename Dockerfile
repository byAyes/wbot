FROM node:20-slim

# Install build dependencies for native modules (better-sqlite3, @napi-rs/canvas)
# and ffmpeg for music/download features
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Create data directory
RUN mkdir -p data/downloads

# Expose port (optional, for health checks)
EXPOSE 3000

# Run the bot
CMD ["node", "index.js"]
