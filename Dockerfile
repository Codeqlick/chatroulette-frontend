# Dockerfile para Frontend - Producción
FROM node:22-alpine AS builder

WORKDIR /app

# Configurar npm para reducir warnings y notices
# Usar variables de entorno que se aplican a todos los comandos npm
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_LOGLEVEL=error
ENV NPM_CONFIG_PROGRESS=false

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
# --silent reduce aún más la salida, --no-audit y --no-fund suprimen warnings
RUN npm ci --silent --no-audit --no-fund

# Copiar código fuente
COPY . .

# Build de producción
# Las variables de entorno deben pasarse como ARG durante el build
# IMPORTANTE: Estas variables se inyectan en tiempo de BUILD, no en tiempo de ejecución
# Defaults para desarrollo local - se pueden sobrescribir con --build-arg
ARG VITE_API_URL=http://localhost:3000/api/v1
ARG VITE_WS_URL=ws://localhost:3000

# Stripe publishable key (inyectada en tiempo de build)
ARG VITE_STRIPE_PUBLISHABLE_KEY=""

# Vite requiere que las variables estén como ENV durante el build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

# Build con salida reducida (las variables NPM_CONFIG_* ya están configuradas)
RUN npm run build

# Stage de producción con Nginx
FROM nginx:alpine

# Instalar wget para el healthcheck
RUN apk add --no-cache wget

# Copiar archivos compilados
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto
EXPOSE 80

# NOTA: El healthcheck se define en docker-compose.production.yml
# No definir HEALTHCHECK aquí para evitar conflictos

CMD ["nginx", "-g", "daemon off;"]

