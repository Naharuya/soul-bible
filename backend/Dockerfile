FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
CMD ["node", "src/server.js"]
