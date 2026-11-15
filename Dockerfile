# 构建阶段：安装依赖并产出 dist
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

# 运行阶段：运行时零第三方依赖（server/shared 均为纯 Node ESM），
# 静态资源 + /api 同进程，数据持久化在 DATA_DIR
FROM node:22-alpine
ENV NODE_ENV=production
ENV DATA_DIR=/opt/huahuacai/results
WORKDIR /opt/huahuacai
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/package.json ./package.json
EXPOSE 80
CMD ["node", "server/docker-server.js"]
