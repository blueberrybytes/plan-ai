# Build Stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* ./
RUN npm install
COPY . .
RUN npm run docs:build

# Production Stage
FROM nginx:alpine
# Copy built static files to Nginx default html directory
COPY --from=build /app/src/.vitepress/dist /usr/share/nginx/html
# Expose port 80
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
