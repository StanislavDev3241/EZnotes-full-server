# Frontend Dockerfile for VPS deployment (No Nginx required)
FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Verify build output
RUN ls -la dist/ && echo "Build completed successfully"

# Production stage - Use Node.js to serve static files
FROM node:18-alpine

# Install serve package globally
RUN npm install -g serve

# Copy built app
COPY --from=build /app/dist /app/dist

# Verify files are copied
RUN ls -la /app/dist/ && echo "Files copied successfully"

# Expose port 80
EXPOSE 80

# Start the app using serve with verbose logging
CMD ["serve", "-s", "/app/dist", "-l", "80", "--debug"] 