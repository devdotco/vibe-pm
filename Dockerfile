FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .

# next.config.ts reads this to set `deploymentId`, which is baked into the
# client bundle at build time. Coolify passes SOURCE_COMMIT as a build arg;
# an empty value is handled there and simply disables the stamping.
ARG SOURCE_COMMIT
ENV SOURCE_COMMIT=$SOURCE_COMMIT

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache postgresql-client

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle

COPY start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 3000
CMD ["./start.sh"]
