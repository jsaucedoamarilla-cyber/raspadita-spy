# Raspadita San Pedro del Ycuamandyyú — Paquete APK

Contiene todo lo necesario para armar la app Android (APK).

## Contenido

```
raspadita-apk/
  www/                    ← App web (HTML + PWA)
    index.html
    manifest.webmanifest
    sw.js
    icons/
  android-webview/        ← Proyecto Android (WebView)
  README-APK.md
```

## Opción 1 — Más fácil: PWA Builder (recomendado)

1. Subí la carpeta `www/` a un hosting HTTPS (Netlify Drop, GitHub Pages, etc.)
   o usá el ZIP de solo `www/` en https://www.pwabuilder.com
2. Entrá a https://www.pwabuilder.com
3. Pegá la URL de tu sitio → **Start**
4. **Package for stores** → **Android** → Generate
5. Descargá el APK / bundle

## Opción 2 — Android Studio (WebView local)

1. Instalá Android Studio: https://developer.android.com/studio
2. Abrí la carpeta `android-webview/`
3. Copiá `www/` a `android-webview/app/src/main/assets/www/`:

```bash
mkdir -p android-webview/app/src/main/assets
cp -r www android-webview/app/src/main/assets/
```

4. En Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. El APK queda en `app/build/outputs/apk/debug/`

## Links de boleta (demo)

Cuando la app carga desde internet:

- Sin premio: `?t=FC68H5YYY4KTDPRJ`
- ₲ 5.000: `?t=NC5T3ENVBZ5V8ZM7`
- ₲ 50.000: `?t=Y9VSSQMY3JTUJ9AA`
- JACKPOT: `?t=M6BXWXBPV6QU8KM7`
- Jugada más: `?t=6K88CDA73596VKEG`

En el APK local (file://) las boletas por link necesitan estar online o
incluir más tokens en `window.__DEMO` del index.html.

## WhatsApp

Número configurado: 0984 363 598 (Paraguay)

## Notas

- Solo mayores de 18 años / juego responsable
- Para producción: generá tokens reales y un backend (no solo __DEMO)
- Iconos incluidos son placeholders amarillos; reemplazalos en www/icons/
