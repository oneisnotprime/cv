FROM node:22-slim
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/market.db
EXPOSE 8080
CMD ["node", "--no-warnings", "server.js"]
