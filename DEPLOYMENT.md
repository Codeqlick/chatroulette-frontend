# Guía de Despliegue Frontend a Producción

Esta guía describe el proceso paso a paso para desplegar el frontend de ChatRoulette en producción.

## Prerrequisitos

- Node.js >= 18.0.0
- Servidor web (Nginx, Apache, etc.) o plataforma de hosting estático (Vercel, Netlify, etc.)

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto frontend con las siguientes variables:

```bash
# API Backend URL
VITE_API_URL=https://api.codeqlick.com/api/v1

# WebSocket Server URL
VITE_WS_URL=wss://api.codeqlick.com
```

**Nota**: Las variables de Vite deben comenzar con `VITE_` para ser incluidas en el build.

## Proceso de Despliegue

### 1. Instalar Dependencias

```bash
npm ci
```

### 2. Configurar Variables de Entorno

```bash
# Copiar ejemplo y editar
cp .env.example .env

# Editar .env con valores de producción
# VITE_API_URL=https://api.codeqlick.com/api/v1
# VITE_WS_URL=wss://api.codeqlick.com
```

### 3. Build del Proyecto

```bash
# Build para producción
npm run build

# El build generará archivos en la carpeta `dist/`
```

### 4. Verificar Build

```bash
# Verificar que el build fue exitoso
ls -la dist/

# Debe contener:
# - index.html
# - assets/ (con archivos JS y CSS)
# - otros archivos estáticos
```

### 5. Desplegar Archivos Estáticos

#### Opción A: Servidor Web (Nginx)

```bash
# Copiar archivos al directorio web
cp -r dist/* /var/www/codeqlick.com/

# Configurar Nginx (ver configuración abajo)
```

#### Opción B: Plataforma de Hosting (Vercel/Netlify)

```bash
# Conectar repositorio a Vercel/Netlify
# Configurar variables de entorno en el dashboard
# Deploy automático en cada push
```

## Configuración de Nginx

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name codeqlick.com www.codeqlick.com;

    # Redirigir HTTP a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name codeqlick.com www.codeqlick.com;

    # Certificados SSL
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    # Root del frontend
    root /var/www/codeqlick.com;
    index index.html;

    # Configuración de seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Archivos estáticos
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache para assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # No cache para index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

## Configuración de SSL/HTTPS

**IMPORTANTE**: HTTPS es obligatorio en producción. Configura SSL usando:

- Let's Encrypt (gratuito)
- Certificados de tu proveedor de hosting
- Cloudflare (proxy con SSL)

## Verificaciones Post-Despliegue

1. **Verificar que la aplicación carga correctamente**
   ```bash
   curl https://codeqlick.com
   ```

2. **Verificar que las variables de entorno están configuradas**
   - Abrir DevTools del navegador
   - Verificar que las llamadas API van a `https://api.codeqlick.com`
   - Verificar que WebSocket se conecta a `wss://api.codeqlick.com`

3. **Verificar CORS**
   - El backend debe tener `CORS_ORIGIN=https://codeqlick.com` configurado
   - Las peticiones desde el frontend deben funcionar sin errores CORS

4. **Verificar WebSocket**
   - Conectarse a la aplicación
   - Verificar que la conexión WebSocket se establece correctamente

## Troubleshooting

### Error: "Failed to fetch" o errores CORS

Verifica:
- `VITE_API_URL` está configurada correctamente
- Backend tiene `CORS_ORIGIN=https://codeqlick.com` configurado
- Backend está accesible desde el dominio configurado

### Error: WebSocket connection failed

Verifica:
- `VITE_WS_URL` está configurada correctamente (usar `wss://` para HTTPS)
- Backend WebSocket está accesible
- Firewall permite conexiones WebSocket

### Error: Variables de entorno no se aplican

Recuerda:
- Las variables deben comenzar con `VITE_`
- Debes hacer rebuild después de cambiar variables
- En producción, las variables se incluyen en el build (no se pueden cambiar después)

## Comandos Útiles

```bash
# Build para producción
npm run build

# Preview del build localmente
npm run preview

# Verificar tamaño del build
du -sh dist/

# Verificar archivos generados
ls -la dist/
```

## Notas Importantes

- Las variables de entorno se incluyen en el build en tiempo de compilación
- Para cambiar variables después del build, debes hacer rebuild
- El proxy de desarrollo (`vite.config.ts`) solo funciona en modo desarrollo
- En producción, todas las peticiones van directamente al backend configurado en `VITE_API_URL`

