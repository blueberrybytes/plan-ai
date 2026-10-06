FROM node:22.23.1

# FFmpeg for video processing. Chromium to read websites that are drawn by
# JavaScript when a user imports one into a project (services/webRenderService.ts).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium

# Secrets are not build arguments: they would be written into the image
# layers. Railway (or docker run -e) gives them to the container at runtime.

WORKDIR /app
RUN chown node:node /app

# Build and run as the unprivileged "node" user of the base image, so a
# compromised process cannot change the image or bind low ports.
USER node

COPY --chown=node:node package.json yarn.lock ./

RUN yarn install

COPY --chown=node:node . .

RUN npx prisma generate

RUN yarn build

EXPOSE 8080

CMD ["yarn", "start"]
