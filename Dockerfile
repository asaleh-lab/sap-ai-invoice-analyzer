FROM node:26.13.0-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PORT=4004
EXPOSE 4004

CMD ["npx", "cds-serve", "--port", "4004"]
