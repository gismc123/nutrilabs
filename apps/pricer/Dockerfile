FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV PRICER_DATA_DIR=/data
VOLUME /data
EXPOSE 4010

CMD ["node", "src/server.js"]
