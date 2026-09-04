FROM node:20-alpine

WORKDIR /app

# sqlite3 cần build tools trên alpine
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

# Xoá build tools sau khi install
RUN apk del python3 make g++

COPY . .

# Tạo thư mục data cho SQLite
RUN mkdir -p data

EXPOSE 3105

CMD ["node", "src/index.js"]
