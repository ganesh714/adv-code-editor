FROM node:18-alpine

WORKDIR /app

# Install http-server globally
RUN npm install -g http-server

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY src/ ./src/

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the application
CMD ["http-server", "src", "-p", "3000", "-c-1"]