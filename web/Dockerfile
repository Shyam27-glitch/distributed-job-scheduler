FROM node:20-alpine
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY api/package.json api/package.json
COPY worker/package.json worker/package.json
COPY web/package.json web/package.json
RUN npm install
COPY web web
WORKDIR /repo/web
EXPOSE 5173
CMD ["npm", "run", "dev"]
