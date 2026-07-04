FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY api/package.json api/package.json
COPY worker/package.json worker/package.json
COPY web/package.json web/package.json
RUN npm install
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY api api
COPY docs docs
RUN npm run build -w packages/shared && npm run build -w @job-scheduler/api

FROM node:20-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/package.json package.json
COPY --from=build /repo/packages/shared packages/shared
COPY --from=build /repo/api api
COPY --from=build /repo/docs docs

EXPOSE 3000
CMD ["sh", "-c", "npm run migrate -w packages/shared && node api/dist/index.js"]
