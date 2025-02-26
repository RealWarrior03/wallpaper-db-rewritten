FROM node:18-alpine

WORKDIR /app

# Kopiere package.json und package-lock.json (falls vorhanden)
COPY package*.json ./

# Installiere Abhängigkeiten
RUN npm install

# Kopiere den Rest des Codes
COPY . .

# Erstelle uploads Verzeichnis
RUN mkdir -p public/uploads

# Exponiere Port 3003
EXPOSE 3003

# Starte den Server
CMD ["node", "server.js"] 