FROM node:20-alpine

WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install all dependencies (including devDependencies like tsx/typescript)
RUN npm ci

# Copy the server script and the default docs directory
COPY index.ts ./
COPY docs ./docs

# Set environment variables
ENV NODE_ENV=production
ENV DOCS_FOLDER=docs

# Run using npx tsx directly to avoid npm start log noise
CMD ["npx", "tsx", "index.ts"]
