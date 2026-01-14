# Use Playwright's official image (includes browsers)
FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app files
COPY app.js ./

# Create captures directory
RUN mkdir -p captures

# Expose port
EXPOSE 3000

# Run server
CMD ["node", "app.js"]
