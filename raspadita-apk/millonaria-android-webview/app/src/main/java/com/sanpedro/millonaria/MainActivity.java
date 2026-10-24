package com.sanpedro.millonaria;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.widget.Toast;

public class MainActivity extends Activity {
 private WebView web;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  web = new WebView(this);
  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setDatabaseEnabled(true);
  settings.setAllowFileAccess(true);
  settings.setMediaPlaybackRequiresUserGesture(false);
  web.setWebViewClient(new WebViewClient() {
   @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
    return openExternal(url);
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    return openExternal(request.getUrl().toString());
   }
   private boolean openExternal(String url) {
    if (url.startsWith("https://wa.me/") || url.startsWith("https://api.whatsapp.com/") ||
        url.startsWith("whatsapp://") || url.startsWith("intent://")) {
     try {
      Intent intent = url.startsWith("intent://")
        ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
        : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
      startActivity(intent);
     } catch (Exception e) {
      Toast.makeText(MainActivity.this, "No se pudo abrir WhatsApp. Verificá que esté instalado.", Toast.LENGTH_LONG).show();
     }
     return true;
    }
    return false;
   }
  });
  web.setWebChromeClient(new WebChromeClient());
  setContentView(web);
  web.loadUrl("file:///android_asset/www/selector.html");
 }
 @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}