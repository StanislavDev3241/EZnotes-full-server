# Frontend Dockerfile for VPS deployment (No Nginx required)
FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage - Use Node.js to serve static files
FROM node:18-alpine

# Install serve package globally
RUN npm install -g serve

# Copy built app
COPY --from=build /app/dist /app/dist

# Expose port 80
EXPOSE 80

# Start the app using serve
CMD ["serve", "-s", "/app/dist", "-l", "80"] 