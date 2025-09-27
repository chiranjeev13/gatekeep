FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY app.js ./

RUN mkdir -p logs

USER node

EXPOSE 3000

CMD ["node", "app.js"]
