FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .

# BUILD_ID becomes `deploymentId` in next.config.ts, which stamps every asset
# URL so a request from a tab running an older build is recognisable as skew.
#
# Coolify exposes SOURCE_COMMIT to the RUNNING container but does not pass it as
# a build arg, so it is used when present and otherwise falls back to a
# timestamp. The fallback is what makes this work at all today — without it the
# id was empty at build time and nothing was stamped, which is easy to miss
# because the build still succeeds and the config still looks correct. Any value
# unique per build is sufficient.
ARG SOURCE_COMMIT
RUN BUILD_ID="${SOURCE_COMMIT:-$(date +%s)}" npm run build

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
