FROM node:18-alpine

# Install FFmpeg and other dependencies
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Create directories for video generation
RUN mkdir -p generated_videos temp_assets

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]