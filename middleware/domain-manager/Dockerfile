FROM node:18-alpine

# Install certbot and docker-cli
RUN apk add --no-cache docker-cli certbot

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY app.js ./

RUN mkdir -p logs

EXPOSE 4000

CMD ["node", "app.js"]
