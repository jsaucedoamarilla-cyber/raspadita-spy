package com.sanpedro.raspadita;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (isAssetDirectoryUrl(url)) {
                    view.loadUrl("file:///android_asset/www/index.html" + queryAndFragment(url));
                    return true;
                }
                return handleExternalUrl(url);
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (isAssetDirectoryUrl(url)) {
                    view.loadUrl("file:///android_asset/www/index.html" + queryAndFragment(url));
                    return true;
                }
                return handleExternalUrl(url);
            }
        });
        // Abrir el selector que permite elegir San Pedro o Millonaria.
        webView.loadUrl("file:///android_asset/www/selector.html");
    }

    // Android WebView no resuelve automáticamente index.html al abrir una carpeta local.
    // Las boletas compartidas pueden llegar como file:///android_asset/www/?t=CODIGO.
    private boolean isAssetDirectoryUrl(String rawUrl) {
        Uri uri = Uri.parse(rawUrl);
        String path = uri.getPath() == null ? "" : uri.getPath();
        return "file".equalsIgnoreCase(uri.getScheme())
                && "/android_asset/www/".equals(path);
    }

    private String queryAndFragment(String rawUrl) {
        Uri uri = Uri.parse(rawUrl);
        String suffix = uri.getEncodedQuery() == null ? "" : "?" + uri.getEncodedQuery();
        if (uri.getEncodedFragment() != null) suffix += "#" + uri.getEncodedFragment();
        return suffix;
    }

    private boolean handleExternalUrl(String rawUrl) {
        Uri uri = Uri.parse(rawUrl);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

        // WhatsApp debe abrirse fuera del WebView: no mostrar ERR_UNKNOWN_URL_SCHEME.
        boolean whatsappLink = "whatsapp".equals(scheme) || "intent".equals(scheme)
                || (("https".equals(scheme) || "http".equals(scheme))
                && ("wa.me".equals(host) || "api.whatsapp.com".equals(host)
                || "web.whatsapp.com".equals(host)));
        if (!whatsappLink) return false;

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No se pudo abrir WhatsApp. Verificá que esté instalado.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo abrir el enlace de WhatsApp.", Toast.LENGTH_LONG).show();
        }
        return true;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
