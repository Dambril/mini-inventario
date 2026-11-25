# ---- Etapa 1: compilar vendor/ (necesita esbuild, una devDependency) ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:vendor

# ---- Etapa 2: imagen final, solo lo necesario para ejecutar ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public
COPY --from=build /app/vendor ./vendor

USER node
EXPOSE 3000

# SUPABASE_URL, SUPABASE_KEY y PORT se pasan al ejecutar; no van en la imagen.
RUN npm run no-existe
CMD ["node", "server.js"]
