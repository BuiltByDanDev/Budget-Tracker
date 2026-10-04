# Build context is the repo root (see docker-compose.yml).

FROM node:22-alpine AS dev
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
CMD ["npm", "run", "dev"]

FROM dev AS build
RUN npm run build

FROM nginx:1.29-alpine AS prod
COPY nginx/prod.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
