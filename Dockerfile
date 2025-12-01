# Usamos la imagen oficial de Playwright que ya tiene TODO instalado (Node, Chrome, dependencias)
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Directorio de trabajo
WORKDIR /app

# Copiamos los archivos de dependencias
COPY package.json package-lock.json ./

# Instalamos las dependencias de Node (los navegadores ya vienen en la imagen base)
RUN npm install

# Copiamos el resto del código
COPY . .

# Exponemos el puerto
EXPOSE 3000

# Iniciamos el servidor
CMD ["node", "server.mjs"]
